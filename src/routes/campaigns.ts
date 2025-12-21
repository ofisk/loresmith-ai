import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { FileDAO } from "@/dao/file-dao";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import {
  createCampaign,
  addResourceToCampaign,
  checkResourceExists,
  validateCampaignOwnership,
  getCampaignRagBasePath,
} from "@/lib/campaign-operations";
import { EntityExtractionQueueService } from "@/services/campaign/entity-extraction-queue-service";
import { EntityExtractionQueueDAO } from "@/dao/entity-extraction-queue-dao";
import { SyncQueueService } from "@/services/file/sync-queue-service";
import { extractJwtFromContext } from "@/lib/auth-utils";
import {
  buildResourceAdditionResponse,
  buildCampaignCreationResponse,
  buildCampaignUpdateResponse,
  buildCampaignDeletionResponse,
  buildBulkDeletionResponse,
  buildResourceRemovalResponse,
} from "@/lib/response-builders";
import { CampaignContextSyncService } from "@/services/campaign/campaign-context-sync-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get all campaigns for user
export async function handleGetCampaigns(c: ContextWithAuth) {
  try {
    console.log("[Server] GET /campaigns - starting request");
    console.log("[Server] Context keys:", Object.keys(c));

    const userAuth = (c as any).userAuth;
    console.log("[Server] User auth from middleware:", userAuth);

    if (!userAuth) {
      console.error("[Server] No user auth found in context");
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaigns = await campaignDAO.getCampaignsByUserWithMapping(
      userAuth.username
    );

    console.log(
      `[Server] Found ${campaigns.length} campaigns for user ${userAuth.username}`
    );

    return c.json({ campaigns: campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Create new campaign
export async function handleCreateCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { name, description } = await c.req.json();

    if (!name) {
      return c.json({ error: "Campaign name is required" }, 400);
    }

    const newCampaign = await createCampaign({
      env: c.env,
      username: userAuth.username,
      name,
      description,
    });

    // Sync campaign title and description as searchable context
    try {
      const syncService = new CampaignContextSyncService(c.env);

      // Sync campaign title
      await syncService.syncContext(
        newCampaign.campaignId,
        `${newCampaign.campaignId}-title`,
        "campaign_info",
        "Campaign Title",
        name,
        { field: "title" }
      );

      // Sync campaign description if provided
      if (description) {
        await syncService.syncContext(
          newCampaign.campaignId,
          `${newCampaign.campaignId}-description`,
          "campaign_info",
          "Campaign Description",
          description,
          { field: "description" }
        );
      }

      console.log("[handleCreateCampaign] Synced campaign info");
    } catch (syncError) {
      console.error(
        "[handleCreateCampaign] Failed to sync campaign:",
        syncError
      );
      // Don't fail campaign creation if sync fails
    }

    const response = buildCampaignCreationResponse(newCampaign);
    return c.json(response, 201);
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get specific campaign
export async function handleGetCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    return c.json({ campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get campaign resources
export async function handleGetCampaignResources(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const resources = await campaignDAO.getCampaignResources(campaignId);

    return c.json({ resources });
  } catch (error) {
    console.error("Error fetching campaign resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleUpdateCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const body = (await c.req.json()) as {
      name?: string;
      description?: string;
    };

    console.log(`[Server] PUT /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);
    console.log("[Server] Update data:", body);

    // Validate campaign ownership
    const { valid, campaign } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Update the campaign using DAO
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    await campaignDAO.updateCampaign(campaignId, {
      name: body.name || campaign!.name,
      description: body.description || "",
    });

    console.log(`[Server] Updated campaign ${campaignId}`);

    // Sync updated campaign info
    try {
      const syncService = new CampaignContextSyncService(c.env);

      // Update campaign title if changed
      if (body.name) {
        await syncService.syncContext(
          campaignId,
          `${campaignId}-title`,
          "campaign_info",
          "Campaign Title",
          body.name,
          { field: "title" }
        );
      }

      // Update campaign description if changed
      if (body.description !== undefined) {
        await syncService.syncContext(
          campaignId,
          `${campaignId}-description`,
          "campaign_info",
          "Campaign Description",
          body.description,
          { field: "description" }
        );
      }

      console.log("[handleUpdateCampaign] Synced updated campaign info");
    } catch (syncError) {
      console.error(
        "[handleUpdateCampaign] Failed to sync campaign:",
        syncError
      );
      // Don't fail campaign update if sync fails
    }

    // Fetch the updated campaign
    const updatedCampaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    const response = buildCampaignUpdateResponse(updatedCampaign);
    return c.json(response);
  } catch (error) {
    console.error("Error updating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleDeleteCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    console.log(`[Server] DELETE /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);

    // Validate campaign ownership
    const { valid, campaign } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Delete the campaign (DAO handles cascading deletes)
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    await campaignDAO.deleteCampaign(campaignId);

    console.log(`[Server] Deleted campaign ${campaignId}`);

    const response = buildCampaignDeletionResponse(campaign!);
    return c.json(response);
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete all campaigns for user
export async function handleDeleteAllCampaigns(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    console.log("[Server] DELETE /campaigns - starting request");
    console.log("[Server] User auth from middleware:", userAuth);

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // Delete all campaigns for the user
    const deletedCampaigns = await campaignDAO.deleteAllCampaignsForUser(
      userAuth.username
    );

    console.log(
      `[Server] Found ${deletedCampaigns.length} campaigns to delete`
    );

    const response = buildBulkDeletionResponse(deletedCampaigns);
    return c.json(response);
  } catch (error) {
    console.error("Error deleting all campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Add resource to campaign
export async function handleAddResourceToCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { type, id, name } = await c.req.json();

    console.log(
      `[Server] POST /campaigns/${campaignId}/resource - starting request`
    );
    console.log("[Server] User auth from middleware:", userAuth);
    console.log("[Server] Request body:", { type, id, name });

    if (!type || !id) {
      return c.json({ error: "Resource type and id are required" }, 400);
    }

    // 1) Validate campaign ownership
    const { valid, campaign } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // 2) Check for existing resource (idempotency)
    const { exists, resource: existingResource } = await checkResourceExists(
      campaignId,
      id,
      c.env
    );
    if (exists) {
      console.log(
        `[Server] Resource ${id} already exists in campaign ${campaignId}`
      );
      return c.json(
        {
          resource: existingResource,
          message: "Resource already exists in this campaign",
        },
        200
      );
    }

    // 3) Check if file is indexed before adding to campaign
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const fileRecord = await fileDAO.getFileForRag(id, userAuth.username);

    if (!fileRecord) {
      console.warn(
        `[Server] File ${id} not found in file library for user ${userAuth.username}`
      );
      return c.json(
        { error: "File not found in library. Please upload the file first." },
        404
      );
    }

    // Check if file is fully indexed (status should be 'completed')
    if (fileRecord.status !== FileDAO.STATUS.COMPLETED) {
      console.error(
        `[Server] ERROR: File ${id} is not yet indexed but UI allowed addition. Current status: ${fileRecord.status}. This indicates a UI state sync issue.`
      );

      // Automatically trigger re-indexing to resolve the issue
      console.log(
        `[Server] Auto-triggering re-index for file ${id} to resolve state mismatch`
      );

      try {
        const jwt = extractJwtFromContext(c);

        await SyncQueueService.processFileUpload(
          c.env,
          userAuth.username,
          id,
          fileRecord.file_name,
          jwt
        );

        console.log(
          `[Server] Re-index triggered for ${id}. User should try adding to campaign again once indexing completes.`
        );
      } catch (reindexError) {
        console.error(
          `[Server] Failed to trigger re-index for ${id}:`,
          reindexError
        );
      }

      return c.json(
        {
          error: "File is not yet indexed",
          status: fileRecord.status,
          message: `File status is '${fileRecord.status}'. Re-indexing has been triggered automatically. Please wait a moment and try again.`,
          reindexTriggered: true,
        },
        400
      );
    }

    console.log(
      `[Server] File ${id} is indexed and ready. Status: ${fileRecord.status}`
    );

    // 4) Add resource to campaign
    const resourceId = crypto.randomUUID();
    await addResourceToCampaign({
      env: c.env,
      username: userAuth.username,
      campaignId,
      resourceId,
      fileKey: id,
      fileName: name || id,
    });

    // 5) Queue entity extraction for the newly added resource (asynchronous)
    try {
      console.log(
        `[Server] Queueing entity extraction for campaign: ${campaignId}`
      );

      const campaignRagBasePath = await getCampaignRagBasePath(
        userAuth.username,
        campaignId,
        c.env
      );
      if (!campaignRagBasePath) {
        console.warn(
          `[Server] Campaign RAG not initialized for campaign: ${campaignId}`
        );
        // Continue without entity extraction
      } else {
        // Queue entity extraction asynchronously
        // This allows multiple files to be added in quick succession without overloading the backend
        await EntityExtractionQueueService.queueEntityExtraction({
          env: c.env,
          username: userAuth.username,
          campaignId,
          resourceId,
          resourceName: name || id,
          fileKey: id,
          openaiApiKey: userAuth.openaiApiKey,
        });

        console.log(
          `[Server] Entity extraction queued for resource ${resourceId} in campaign ${campaignId}`
        );
      }
    } catch (queueError) {
      console.error(
        `[Server] Error queueing entity extraction for resource ${resourceId}:`,
        queueError
      );
      // Don't fail the request - resource was added successfully, extraction can be retried
    }

    // Return success response immediately (entity extraction happens in background)
    const response = buildResourceAdditionResponse(
      { id: resourceId, file_name: name || id },
      "Resource added to campaign. Entity extraction is processing in the background. You'll receive a notification when it's complete."
    );
    return c.json(response);
  } catch (error) {
    console.error("Error adding resource to campaign:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a memory limit error
    if (
      errorMessage.includes("memory limit") ||
      errorMessage.includes("exceeded") ||
      errorMessage.includes("Worker exceeded")
    ) {
      return c.json(
        {
          error: "File too large",
          message:
            "This file exceeds our 128MB limit. Please split the file into smaller parts (under 100MB each) or try again later.",
        },
        413
      );
    }

    // Return a user-friendly error message
    const truncatedMessage =
      errorMessage.length > 200
        ? `${errorMessage.substring(0, 200)}...`
        : errorMessage;
    return c.json(
      {
        error: "Failed to add file to campaign",
        message: truncatedMessage,
      },
      500
    );
  }
}

// Retry entity extraction for a resource
export async function handleRetryEntityExtraction(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const resourceId = c.req.param("resourceId");

    console.log(
      `[Server] POST /campaigns/${campaignId}/resource/${resourceId}/retry-entity-extraction - starting request`
    );

    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Validate campaign ownership
    const { valid } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    // Check if the resource exists in this campaign
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const resource = await campaignDAO.getCampaignResourceById(
      resourceId,
      campaignId
    );

    if (!resource) {
      console.log(
        `[Server] Resource ${resourceId} not found in campaign ${campaignId}`
      );
      return c.json({ error: "Resource not found in this campaign" }, 404);
    }

    console.log("[Server] Found resource for retry:", resource);

    // Queue entity extraction retry (asynchronous)
    try {
      await EntityExtractionQueueService.queueEntityExtraction({
        env: c.env,
        username: userAuth.username,
        campaignId,
        resourceId,
        resourceName: resource.file_name || resource.id,
        fileKey: resource.file_key || undefined,
        openaiApiKey: userAuth.openaiApiKey,
      });

      console.log(
        `[Server] Entity extraction retry queued for resource ${resourceId} in campaign ${campaignId}`
      );

      return c.json({
        success: true,
        message:
          "Entity extraction has been queued. You'll receive a notification when it's complete.",
      });
    } catch (error) {
      console.error(
        `[Server] Error during entity extraction retry for resource ${resourceId}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if it's a memory limit error
      if (
        errorMessage.includes("memory limit") ||
        errorMessage.includes("exceeded") ||
        errorMessage.includes("Worker exceeded")
      ) {
        return c.json(
          {
            success: false,
            message: `The file "${resource.file_name}" exceeds our 128MB limit. Please split the file into smaller parts (under 100MB each) or try again later.`,
            error: "MEMORY_LIMIT_EXCEEDED",
          },
          413
        );
      }

      // For rate limit errors, provide actionable message
      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests")
      ) {
        return c.json(
          {
            success: false,
            message: `Entity extraction is being rate-limited. Please wait a few moments and try again. The file is being processed in chunks, which may take longer for large files.`,
            error: "RATE_LIMIT_EXCEEDED",
          },
          429
        );
      }

      // Generic error
      return c.json(
        {
          success: false,
          message: `Failed to queue entity extraction retry: ${errorMessage}`,
          error: errorMessage,
        },
        500
      );
    }
  } catch (error) {
    console.error("Error retrying entity extraction:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a memory limit error
    if (
      errorMessage.includes("memory limit") ||
      errorMessage.includes("exceeded") ||
      errorMessage.includes("Worker exceeded")
    ) {
      return c.json(
        {
          error: "File too large",
          message:
            "This file exceeds our 128MB limit. Please split the file into smaller parts (under 100MB each) or try again later.",
        },
        413
      );
    }

    // Return a user-friendly error message
    const truncatedMessage =
      errorMessage.length > 200
        ? `${errorMessage.substring(0, 200)}...`
        : errorMessage;
    return c.json(
      {
        error: "Failed to retry entity extraction",
        message: `An error occurred: ${truncatedMessage}. Please try again later.`,
      },
      500
    );
  }
}

// Remove resource from campaign
export async function handleRemoveResourceFromCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const resourceId = c.req.param("resourceId");

    console.log(
      `[Server] DELETE /campaigns/${campaignId}/resource/${resourceId} - starting request`
    );
    console.log("[Server] User auth from middleware:", userAuth);

    // Validate campaign ownership
    const { valid, campaign } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Check if the resource exists in this campaign
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const resource = await campaignDAO.getCampaignResourceById(
      resourceId,
      campaignId
    );

    if (!resource) {
      console.log(
        `[Server] Resource ${resourceId} not found in campaign ${campaignId}`
      );
      return c.json({ error: "Resource not found in this campaign" }, 404);
    }

    console.log("[Server] Found resource:", resource);

    // Remove the resource from the campaign
    await campaignDAO.removeCampaignResource(campaignId, resourceId);

    console.log(
      `[Server] Removed resource ${resourceId} from campaign ${campaignId}`
    );

    const response = buildResourceRemovalResponse(resource);
    return c.json(response);
  } catch (error) {
    console.error("Error removing resource from campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get entity extraction queue status for a resource
export async function handleGetEntityExtractionStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const resourceId = c.req.param("resourceId");

    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Validate campaign ownership
    const { valid } = await validateCampaignOwnership(
      campaignId,
      userAuth.username,
      c.env
    );
    if (!valid) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    // Check queue status
    const queueDAO = new EntityExtractionQueueDAO(c.env.DB);
    const queueItem = await queueDAO.getQueueItemByResource(
      campaignId,
      resourceId
    );

    if (!queueItem) {
      // Not in queue - extraction is either completed or never started
      return c.json({
        inQueue: false,
        status: null,
      });
    }

    return c.json({
      inQueue: true,
      status: queueItem.status,
      retryCount: queueItem.retry_count,
      lastError: queueItem.last_error,
      errorCode: queueItem.error_code,
      nextRetryAt: queueItem.next_retry_at,
      createdAt: queueItem.created_at,
      processedAt: queueItem.processed_at,
    });
  } catch (error) {
    console.error("Error getting entity extraction status:", error);
    return c.json(
      {
        error: "Failed to get extraction status",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
}
