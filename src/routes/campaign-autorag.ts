import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { notifyShardApproval, notifyShardRejection } from "@/lib/notifications";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get staged entities for a campaign (UI refers to them as "shards")
export async function handleGetStagedShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const resourceId = c.req.query("resourceId");

    console.log(`[Server] Getting staged entities for campaign: ${campaignId}`);

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const basePath = campaign?.campaignRagBasePath || `campaigns/${campaignId}`;

    // Get all entities for the campaign with staging status
    const daoFactory = getDAOFactory(c.env);
    const allEntities =
      await daoFactory.entityDAO.listEntitiesByCampaign(campaignId);

    // Filter to only staging entities
    const stagedEntities = allEntities.filter((entity) => {
      const metadata = (entity.metadata as Record<string, unknown>) || {};
      const shardStatus = metadata.shardStatus;
      if (shardStatus !== "staging") {
        return false;
      }
      // Filter by resourceId if provided
      if (resourceId && metadata.resourceId !== resourceId) {
        return false;
      }
      return true;
    });

    console.log(
      `[Server] Found ${stagedEntities.length} staged entities for campaign ${campaignId}`
    );

    // Group entities by resourceId to match StagedShardGroup interface (UI compatibility)
    const groupedByResource = new Map<
      string,
      {
        key: string;
        sourceRef: any;
        shards: any[]; // UI uses "shards" terminology
        created_at: string;
        campaignRagBasePath: string;
      }
    >();

    for (const entity of stagedEntities) {
      const metadata = (entity.metadata as Record<string, unknown>) || {};
      const resourceId = (metadata.resourceId as string) || "unknown";
      const resourceName = (metadata.resourceName as string) || "unknown";
      const fileKey = (metadata.fileKey as string) || resourceId;

      if (!groupedByResource.has(resourceId)) {
        groupedByResource.set(resourceId, {
          key: `entity_staging_${resourceId}`,
          sourceRef: {
            fileKey,
            meta: {
              fileName: resourceName,
              campaignId,
              entityType: entity.entityType,
              chunkId: "",
              score: 0,
            },
          },
          shards: [], // UI uses "shards" terminology
          created_at: entity.createdAt,
          campaignRagBasePath: basePath,
        });
      }

      // Convert entity to shard format for UI compatibility (UI uses "shard" terminology)
      const shard = {
        id: entity.id,
        text: JSON.stringify(entity.content),
        metadata: {
          ...metadata,
          entityType: entity.entityType,
          confidence: entity.confidence || 0.9,
        },
        sourceRef: {
          fileKey,
          meta: {
            fileName: resourceName,
            campaignId,
            entityType: entity.entityType,
            chunkId: entity.id,
            score: 0,
          },
        },
      };

      groupedByResource.get(resourceId)!.shards.push(shard);
    }

    const stagedShardGroups = Array.from(groupedByResource.values());

    console.log(
      `[Server] Grouped ${stagedEntities.length} entities into ${stagedShardGroups.length} groups for UI`
    );

    // Return the grouped entities in shard format for UI compatibility
    return c.json({ shards: stagedShardGroups });
  } catch (error) {
    console.error("[Server] Error getting staged entities:", error);
    return c.json({ error: "Failed to get staged entities" }, 500);
  }
}

// Approve entities for a campaign (UI refers to them as "shards")
export async function handleApproveShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { shardIds } = await c.req.json(); // UI uses "shardIds" terminology

    if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
      return c.json({ error: "shardIds array is required" }, 400);
    }

    console.log(
      `[Server] Approving ${shardIds.length} entities for campaign: ${campaignId}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const graphService = new EntityGraphService(daoFactory.entityDAO);

    let approvedCount = 0;
    let relationshipCount = 0;

    // Approve each entity (shardIds from UI are entity IDs) and create its relationships
    for (const entityId of shardIds) {
      const entity = await daoFactory.entityDAO.getEntityById(entityId);

      if (!entity || entity.campaignId !== campaignId) {
        console.warn(
          `[Server] Entity ${entityId} not found or wrong campaign, skipping`
        );
        continue;
      }

      const metadata = (entity.metadata as Record<string, unknown>) || {};
      if (metadata.shardStatus !== "staging") {
        console.log(
          `[Server] Entity ${entityId} is not in staging (status: ${metadata.shardStatus}), skipping`
        );
        continue;
      }

      // Extract pendingRelations before updating metadata
      const pendingRelations =
        (metadata.pendingRelations as Array<{
          relationshipType: string;
          targetId: string;
          strength?: number | null;
          metadata?: Record<string, unknown>;
        }>) || [];

      // Update entity status to approved (remove pendingRelations from metadata)
      const { pendingRelations: _, ...metadataWithoutPending } = metadata;
      const updatedMetadata = {
        ...metadataWithoutPending,
        shardStatus: "approved" as const,
        staged: false,
        approvedAt: new Date().toISOString(),
      };

      await daoFactory.entityDAO.updateEntity(entityId, {
        metadata: updatedMetadata,
      });

      approvedCount++;

      // Create relationships for this entity
      for (const relation of pendingRelations) {
        try {
          // Check if target entity exists
          const targetEntity = await daoFactory.entityDAO.getEntityById(
            relation.targetId
          );

          if (!targetEntity || targetEntity.campaignId !== campaignId) {
            console.warn(
              `[Server] Target entity ${relation.targetId} not found for relationship, skipping`
            );
            continue;
          }

          // Create the relationship
          await graphService.upsertEdge({
            campaignId,
            fromEntityId: entityId,
            toEntityId: relation.targetId,
            relationshipType: relation.relationshipType,
            strength: relation.strength ?? null,
            metadata: relation.metadata,
            allowSelfRelation: false,
          });

          relationshipCount++;
        } catch (relError) {
          console.error(
            `[Server] Error creating relationship for entity ${entityId}:`,
            relError
          );
          // Continue with other relationships
        }
      }
    }

    console.log(
      `[Server] Approved ${approvedCount} entities and created ${relationshipCount} relationships for campaign: ${campaignId}`
    );

    // Send notification about entity approval (UI uses "shard" terminology)
    try {
      await notifyShardApproval(
        c.env,
        userAuth.username,
        campaign.name,
        approvedCount
      );
    } catch (error) {
      console.error(
        "[Server] Failed to send entity approval notification:",
        error
      );
    }

    return c.json({
      success: true,
      approvedCount,
      relationshipCount,
    });
  } catch (error) {
    console.error("[Server] Error approving entities:", error);
    return c.json({ error: "Failed to approve entities" }, 500);
  }
}

// Reject entities for a campaign (UI refers to them as "shards")
export async function handleRejectShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { shardIds, reason } = await c.req.json(); // UI uses "shardIds" terminology

    if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
      return c.json({ error: "shardIds array is required" }, 400);
    }

    if (!reason) {
      return c.json({ error: "reason is required" }, 400);
    }

    console.log(
      `[Server] Rejecting ${shardIds.length} entities for campaign: ${campaignId}, reason: ${reason}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const graphService = new EntityGraphService(daoFactory.entityDAO);

    let rejectedCount = 0;
    let relationshipCount = 0;

    // Reject each entity (shardIds from UI are entity IDs) - mark as rejected but keep in graph with ignore flag
    for (const entityId of shardIds) {
      const entity = await daoFactory.entityDAO.getEntityById(entityId);

      if (!entity || entity.campaignId !== campaignId) {
        console.warn(
          `[Server] Entity ${entityId} not found or wrong campaign, skipping`
        );
        continue;
      }

      const metadata = (entity.metadata as Record<string, unknown>) || {};
      if (metadata.shardStatus !== "staging") {
        console.log(
          `[Server] Entity ${entityId} is not in staging (status: ${metadata.shardStatus}), skipping`
        );
        continue;
      }

      // Extract pendingRelations before updating metadata
      const pendingRelations =
        (metadata.pendingRelations as Array<{
          relationshipType: string;
          targetId: string;
          strength?: number | null;
          metadata?: Record<string, unknown>;
        }>) || [];

      // Update entity status to rejected with ignore flag (remove pendingRelations from metadata)
      const { pendingRelations: _, ...metadataWithoutPending } = metadata;
      const updatedMetadata = {
        ...metadataWithoutPending,
        shardStatus: "rejected" as const,
        rejected: true,
        ignored: true, // Flag to ignore this entity in graph operations
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
      };

      await daoFactory.entityDAO.updateEntity(entityId, {
        metadata: updatedMetadata,
      });

      rejectedCount++;

      // Still create relationships but mark them as rejected/ignored
      for (const relation of pendingRelations) {
        try {
          // Check if target entity exists
          const targetEntity = await daoFactory.entityDAO.getEntityById(
            relation.targetId
          );

          if (!targetEntity || targetEntity.campaignId !== campaignId) {
            console.warn(
              `[Server] Target entity ${relation.targetId} not found for relationship, skipping`
            );
            continue;
          }

          // Create the relationship with rejected metadata
          await graphService.upsertEdge({
            campaignId,
            fromEntityId: entityId,
            toEntityId: relation.targetId,
            relationshipType: relation.relationshipType,
            strength: relation.strength ?? null,
            metadata: {
              ...relation.metadata,
              rejected: true,
              ignored: true,
              rejectionReason: reason,
            },
            allowSelfRelation: false,
          });

          relationshipCount++;
        } catch (relError) {
          console.error(
            `[Server] Error creating rejected relationship for entity ${entityId}:`,
            relError
          );
          // Continue with other relationships
        }
      }
    }

    console.log(
      `[Server] Rejected ${rejectedCount} entities and created ${relationshipCount} relationships (marked as ignored) for campaign: ${campaignId}`
    );

    // Send notification about entity rejection (UI uses "shard" terminology)
    try {
      await notifyShardRejection(
        c.env,
        userAuth.username,
        campaign.name,
        rejectedCount,
        reason
      );
    } catch (error) {
      console.error(
        "[Server] Failed to send entity rejection notification:",
        error
      );
    }

    return c.json({
      success: true,
      rejectedCount,
      relationshipCount,
    });
  } catch (error) {
    console.error("[Server] Error rejecting entities:", error);
    return c.json({ error: "Failed to reject entities" }, 500);
  }
}

// Update a single entity (UI refers to it as "shard")
export async function handleUpdateShard(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const shardId = c.req.param("shardId"); // UI uses "shardId" but it's an entity ID
    const userAuth = (c as any).userAuth;
    const { text, metadata } = await c.req.json();

    if (!text && !metadata) {
      return c.json({ error: "Either text or metadata must be provided" }, 400);
    }

    console.log(
      `[Server] Updating entity ${shardId} for campaign: ${campaignId}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    // Update entity directly in database (entities are stored in DB, not R2)
    const daoFactory = getDAOFactory(c.env);
    const entity = await daoFactory.entityDAO.getEntityById(shardId);

    if (!entity || entity.campaignId !== campaignId) {
      return c.json({ error: "Entity not found" }, 404);
    }

    // Update entity content and metadata
    const updatedContent = text ? JSON.parse(text) : entity.content;
    const updatedMetadata = metadata
      ? { ...(entity.metadata as Record<string, unknown>), ...metadata }
      : entity.metadata;

    await daoFactory.entityDAO.updateEntity(shardId, {
      content: updatedContent,
      metadata: updatedMetadata,
    });

    console.log(`[Server] Successfully updated entity ${shardId} in database`);

    return c.json({
      success: true,
      message: "Entity updated successfully",
      shard: {
        id: entity.id,
        text: JSON.stringify(updatedContent),
        metadata: updatedMetadata,
      },
    });
  } catch (error) {
    console.error("[Server] Error updating entity:", error);
    return c.json({ error: "Failed to update entity" }, 500);
  }
}
