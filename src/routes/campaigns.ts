import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import {
  createCampaign,
  addResourceToCampaign,
  checkResourceExists,
  validateCampaignOwnership,
  getCampaignRagBasePath,
} from "../lib/campaign-operations";
import {
  generateShardsForResource,
  notifyShardCount,
} from "../services/shard-generation-service";
import {
  buildShardGenerationResponse,
  buildResourceAdditionResponse,
  buildCampaignCreationResponse,
  buildCampaignUpdateResponse,
  buildCampaignDeletionResponse,
  buildBulkDeletionResponse,
  buildResourceRemovalResponse,
} from "../lib/response-builders";

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

    // 3) Add resource to campaign
    const resourceId = crypto.randomUUID();
    const newResource = await addResourceToCampaign({
      env: c.env,
      username: userAuth.username,
      campaignId,
      resourceId,
      fileKey: id,
      fileName: name || id,
    });

    // 4) Generate shards for the newly added resource
    try {
      console.log(`[Server] Generating shards for campaign: ${campaignId}`);

      const campaignRagBasePath = await getCampaignRagBasePath(
        userAuth.username,
        campaignId,
        c.env
      );
      if (!campaignRagBasePath) {
        console.warn(
          `[Server] Campaign AutoRAG not initialized for campaign: ${campaignId}`
        );
        // Continue without shard generation
      } else {
        // Fetch the specific resource we just created to avoid ordering issues
        const campaignDAO = getDAOFactory(c.env).campaignDAO;
        const resource = await campaignDAO.getCampaignResourceById(
          resourceId,
          campaignId
        );

        if (!resource) {
          console.warn(
            `[Server] Newly added resource not found in campaign: ${campaignId} (resourceId: ${resourceId})`
          );
          const response = buildResourceAdditionResponse(
            { id: resourceId, file_name: name || id },
            "Resource added to campaign. Shard generation deferred (resource lookup failed)."
          );
          return c.json(response);
        }

        // Generate shards using the service
        const shardResult = await generateShardsForResource({
          env: c.env,
          username: userAuth.username,
          campaignId,
          campaignName: campaign!.name,
          resource,
          campaignRagBasePath,
        });

        if (shardResult.success && shardResult.shardCount > 0) {
          // Send notification about shard count
          await notifyShardCount(
            c.env,
            userAuth.username,
            campaignId,
            campaign!.name,
            resource.file_name || resource.id,
            resource.id,
            shardResult.shardCount
          );

          // Return response with shard data
          const response = buildShardGenerationResponse(
            resource,
            shardResult.shardCount,
            campaignId,
            shardResult.serverGroups
          );
          return c.json(response);
        } else {
          // Send zero shard notification
          await notifyShardCount(
            c.env,
            userAuth.username,
            campaignId,
            campaign!.name,
            resource.file_name || resource.id,
            resource.id,
            0
          );

          const response = buildResourceAdditionResponse(
            resource,
            "Resource added to campaign successfully. No shards could be generated from this resource."
          );
          return c.json(response);
        }
      }
    } catch (shardError) {
      console.error(`[Server] Error generating shards:`, shardError);
      // Still notify user with zero shards when generation fails
      try {
        const campaignData = await getDAOFactory(
          c.env
        ).campaignDAO.getCampaignById(campaignId);
        if (campaignData) {
          await notifyShardCount(
            c.env,
            userAuth.username,
            campaignId,
            campaignData.name,
            name || id,
            resourceId,
            0
          );
        }
      } catch (notifyErr) {
        console.error(
          "[Server] Failed to send zero-shard notification after error:",
          notifyErr
        );
      }
      // Don't fail the resource addition if shard generation fails
    }

    // 5) Return success response without shards
    return c.json({ resource: newResource }, 201);
  } catch (error) {
    console.error("Error adding resource to campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
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
