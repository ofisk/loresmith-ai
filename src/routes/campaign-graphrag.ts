import { getDAOFactory } from "@/dao/dao-factory";
import { notifyShardApproval, notifyShardRejection } from "@/lib/notifications";
import { RebuildTriggerService } from "@/services/graph/rebuild-trigger-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { RebuildQueueService } from "@/services/graph/rebuild-queue-service";
import { type ContextWithAuth, verifyCampaignAccess } from "@/lib/route-utils";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { OpenAIEmbeddingService } from "@/services/embedding/openai-embedding-service";

interface PendingRelation {
  relationshipType: string;
  targetId: string;
  strength?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Extract pendingRelations from entity metadata
 */
function extractPendingRelations(
  metadata: Record<string, unknown>
): PendingRelation[] {
  return (metadata.pendingRelations as Array<PendingRelation>) || [];
}

/**
 * Check if there are remaining staging entities and trigger async rebuild if none remain
 */
async function checkAndRunCommunityDetection(
  daoFactory: ReturnType<typeof getDAOFactory>,
  campaignId: string,
  env: any,
  affectedEntityIds?: string[],
  username?: string
): Promise<void> {
  const allEntities =
    await daoFactory.entityDAO.listEntitiesByCampaign(campaignId);
  const remainingStagingEntities = allEntities.filter((entity) => {
    const metadata = (entity.metadata as Record<string, unknown>) || {};
    return metadata.shardStatus === "staging";
  });

  const rebuildTriggerService = new RebuildTriggerService(
    daoFactory.campaignDAO
  );

  if (remainingStagingEntities.length === 0) {
    const decision = await rebuildTriggerService.makeRebuildDecision(
      campaignId,
      affectedEntityIds
    );

    if (decision.shouldRebuild) {
      console.log(
        `[Server] All pending shards processed for campaign ${campaignId}, rebuild triggered (${decision.rebuildType})`
      );

      // Check if queue binding is available
      if (!(env as any).GRAPH_REBUILD_QUEUE) {
        console.warn(
          `[Server] GRAPH_REBUILD_QUEUE binding not configured, skipping async rebuild for campaign ${campaignId}`
        );
        return;
      }

      try {
        // Get username from campaign if not provided
        let triggeredBy = username || "system";
        if (!username) {
          const campaign =
            await daoFactory.campaignDAO.getCampaignById(campaignId);
          if (campaign) {
            triggeredBy = campaign.username;
          }
        }

        // Create rebuild status entry
        // decision.rebuildType is guaranteed to be "full" or "partial" when shouldRebuild is true
        const rebuildType =
          decision.rebuildType === "partial" ? "partial" : "full";
        const rebuildId = crypto.randomUUID();
        await daoFactory.rebuildStatusDAO.createRebuild({
          id: rebuildId,
          campaignId,
          rebuildType,
          status: "pending",
          affectedEntityIds:
            rebuildType === "partial" ? affectedEntityIds : undefined,
        });

        // Enqueue rebuild job
        const queueService = new RebuildQueueService(
          (env as any).GRAPH_REBUILD_QUEUE
        );
        await queueService.enqueueRebuild({
          rebuildId,
          campaignId,
          rebuildType,
          affectedEntityIds:
            rebuildType === "partial" ? affectedEntityIds : undefined,
          triggeredBy,
          options: {
            regenerateSummaries: true,
            recalculateImportance: true,
          },
        });

        console.log(
          `[Server] Rebuild ${rebuildId} enqueued for campaign ${campaignId} (type: ${decision.rebuildType})`
        );
      } catch (queueError) {
        console.error(
          `[Server] Error enqueueing rebuild for campaign ${campaignId}:`,
          queueError
        );
        await rebuildTriggerService.logRebuildDecision(campaignId, decision, {
          success: false,
        });
      }
    } else {
      console.log(
        `[Server] All pending shards processed for campaign ${campaignId}, but rebuild not needed (impact: ${decision.cumulativeImpact})`
      );
    }
  } else {
    console.log(
      `[Server] ${remainingStagingEntities.length} staging entities remaining for campaign ${campaignId}, skipping rebuild trigger`
    );
  }
}

/**
 * Validate entity exists and is in staging status
 */
async function validateStagingEntity(
  daoFactory: ReturnType<typeof getDAOFactory>,
  entityId: string,
  campaignId: string
): Promise<{ entity: any; pendingRelations: PendingRelation[] } | null> {
  const entity = await daoFactory.entityDAO.getEntityById(entityId);

  if (!entity || entity.campaignId !== campaignId) {
    console.warn(
      `[Server] Entity ${entityId} not found or wrong campaign, skipping`
    );
    return null;
  }

  const metadata = (entity.metadata as Record<string, unknown>) || {};
  if (metadata.shardStatus !== "staging") {
    console.log(
      `[Server] Entity ${entityId} is not in staging (status: ${metadata.shardStatus}), skipping`
    );
    return null;
  }

  const pendingRelations = extractPendingRelations(metadata);

  return { entity, pendingRelations };
}

// Get staged entities for a campaign (UI refers to them as "shards")
export async function handleGetStagedShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const resourceId = c.req.query("resourceId");

    console.log(`[Server] Getting staged entities for campaign: ${campaignId}`);

    // Verify campaign belongs to user
    const campaign = await verifyCampaignAccess(
      c,
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const basePath = campaign.campaignRagBasePath;

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
          importanceScore: metadata.importanceScore,
          importanceOverride: metadata.importanceOverride,
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
    const campaign = await verifyCampaignAccess(
      c,
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const graphService = new EntityGraphService(daoFactory.entityDAO);
    const embeddingService = new EntityEmbeddingService(c.env.VECTORIZE);
    const openaiEmbeddingService = new OpenAIEmbeddingService(
      c.env.OPENAI_API_KEY as string | undefined
    );

    // Diagnostic: List all entities in campaign to help debug relationship target ID mismatches
    const allCampaignEntities =
      await daoFactory.entityDAO.listEntitiesByCampaign(campaignId);
    console.log(
      `[Server] Campaign has ${allCampaignEntities.length} total entities. Entity IDs:`,
      allCampaignEntities.map((e) => `${e.id} (${e.name})`).join(", ")
    );

    let approvedCount = 0;
    const relationshipCount = 0;

    // Approve each entity (shardIds from UI are entity IDs) and create its relationships
    for (const entityId of shardIds) {
      const validationResult = await validateStagingEntity(
        daoFactory,
        entityId,
        campaignId
      );

      if (!validationResult) {
        continue;
      }

      const { entity } = validationResult;

      // Update entity status to approved (remove pendingRelations from metadata)
      const metadata = (entity.metadata as Record<string, unknown>) || {};
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

      // Ensure entity embedding is indexed in Vectorize for searchability
      try {
        // Check if embedding already exists in Vectorize by trying to find similar entities
        // This will return empty if the embedding doesn't exist
        let hasEmbedding = false;
        if (c.env.VECTORIZE) {
          const existingVectors = await c.env.VECTORIZE.getByIds([entityId]);
          hasEmbedding = existingVectors && existingVectors.length > 0;
        }

        if (!hasEmbedding) {
          // Generate and index embedding for this entity
          // Use the same text generation logic as EntityExtractionPipeline
          const contentText =
            typeof entity.content === "string"
              ? entity.content
              : JSON.stringify(entity.content || {});
          const entityText = contentText;

          console.log(
            `[Server] Creating embedding for approved entity: ${entityId} (${entity.name})`
          );

          const embedding =
            await openaiEmbeddingService.generateEmbedding(entityText);
          await embeddingService.upsertEmbedding({
            entityId: entity.id,
            campaignId: entity.campaignId,
            entityType: entity.entityType,
            embedding,
            metadata: updatedMetadata,
          });

          console.log(
            `[Server] Successfully indexed embedding for entity: ${entityId}`
          );
        } else {
          // Update existing embedding metadata to reflect approval status
          if (c.env.VECTORIZE) {
            const existingVectors = await c.env.VECTORIZE.getByIds([entityId]);
            const existingEmbedding = existingVectors?.[0];
            if (existingEmbedding?.values) {
              await embeddingService.upsertEmbedding({
                entityId: entity.id,
                campaignId: entity.campaignId,
                entityType: entity.entityType,
                embedding: Array.from(existingEmbedding.values),
                metadata: updatedMetadata,
              });
              console.log(
                `[Server] Updated embedding metadata for entity: ${entityId}`
              );
            }
          }
        }
      } catch (error) {
        console.warn(
          `[Server] Failed to index embedding for entity ${entityId}:`,
          error
        );
        // Continue with approval even if embedding fails
      }

      approvedCount++;

      // Update relationship status from staging to approved
      const relationships = await graphService.getRelationshipsForEntity(
        campaignId,
        entityId
      );
      for (const rel of relationships) {
        const relMetadata = (rel.metadata as Record<string, unknown>) || {};
        if (relMetadata.status === "staging") {
          await graphService.upsertEdge({
            campaignId,
            fromEntityId: rel.fromEntityId,
            toEntityId: rel.toEntityId,
            relationshipType: rel.relationshipType,
            strength: rel.strength,
            metadata: {
              ...relMetadata,
              status: "approved",
            },
            allowSelfRelation: false,
          });
        }
      }
    }

    // Batch recalculate importance for all entities after approval
    // This is more efficient than calculating per-entity, as it runs PageRank
    // and Betweenness Centrality once for the entire graph
    if (approvedCount > 0) {
      try {
        const importanceService = new EntityImportanceService(
          daoFactory.entityDAO,
          daoFactory.communityDAO,
          daoFactory.entityImportanceDAO
        );
        console.log(
          `[Server] Batch recalculating importance for ${approvedCount} approved entities`
        );
        await importanceService.recalculateImportanceForCampaign(campaignId);
      } catch (error) {
        console.warn(
          `[Server] Failed to recalculate importance after approval:`,
          error
        );
      }
    }

    console.log(
      `[Server] Approved ${approvedCount} entities and created ${relationshipCount} relationships for campaign: ${campaignId}`
    );

    const approvedEntityIds = shardIds;

    // Check if there are any remaining staging entities and run Leiden algorithm if none remain
    await checkAndRunCommunityDetection(
      daoFactory,
      campaignId,
      c.env as any,
      approvedEntityIds,
      userAuth.username
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
    const campaign = await verifyCampaignAccess(
      c,
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const graphService = new EntityGraphService(daoFactory.entityDAO);

    let rejectedCount = 0;
    const relationshipCount = 0;

    // Reject each entity (shardIds from UI are entity IDs) - mark as rejected but keep in graph with ignore flag
    for (const entityId of shardIds) {
      const validationResult = await validateStagingEntity(
        daoFactory,
        entityId,
        campaignId
      );

      if (!validationResult) {
        continue;
      }

      const { entity } = validationResult;

      // Update entity status to rejected with ignore flag (remove pendingRelations from metadata)
      const metadata = (entity.metadata as Record<string, unknown>) || {};
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

      // Update relationship status from staging to rejected
      const relationships = await graphService.getRelationshipsForEntity(
        campaignId,
        entityId
      );
      for (const rel of relationships) {
        const relMetadata = (rel.metadata as Record<string, unknown>) || {};
        if (relMetadata.status === "staging") {
          await graphService.upsertEdge({
            campaignId,
            fromEntityId: rel.fromEntityId,
            toEntityId: rel.toEntityId,
            relationshipType: rel.relationshipType,
            strength: rel.strength,
            metadata: {
              ...relMetadata,
              status: "rejected",
              rejected: true,
              ignored: true,
              rejectionReason: reason,
            },
            allowSelfRelation: false,
          });
        }
      }
    }

    // Batch recalculate importance for all entities after rejection
    // This is more efficient than calculating per-entity, as it runs PageRank
    // and Betweenness Centrality once for the entire graph
    if (rejectedCount > 0) {
      try {
        const importanceService = new EntityImportanceService(
          daoFactory.entityDAO,
          daoFactory.communityDAO,
          daoFactory.entityImportanceDAO
        );
        console.log(
          `[Server] Batch recalculating importance for ${rejectedCount} rejected entities`
        );
        await importanceService.recalculateImportanceForCampaign(campaignId);
      } catch (error) {
        console.warn(
          `[Server] Failed to recalculate importance after rejection:`,
          error
        );
      }
    }

    console.log(
      `[Server] Rejected ${rejectedCount} entities and created ${relationshipCount} relationships (marked as ignored) for campaign: ${campaignId}`
    );

    const rejectedEntityIds = shardIds;

    // Check if there are any remaining staging entities and run Leiden algorithm if none remain
    await checkAndRunCommunityDetection(
      daoFactory,
      campaignId,
      c.env as any,
      rejectedEntityIds,
      userAuth.username
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
    const campaign = await verifyCampaignAccess(
      c,
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
