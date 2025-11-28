// Entity staging service for campaign resources
// Extracts entities from file content and stages them for user approval/rejection
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { notifyShardGeneration } from "@/lib/notifications";
import type { Env } from "@/middleware/auth";
import {
  normalizeResourceForShardGeneration,
  validateShardGenerationOptions,
} from "@/lib/shard-generation-utils";
import type { ContentExtractionProvider } from "./content-extraction-provider";
import { DirectFileContentExtractionProvider } from "./impl/direct-file-content-extraction-provider";
import { R2Helper } from "@/lib/r2";
import type { ExtractedEntity } from "@/services/rag/entity-extraction-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import {
  chunkTextByPages,
  chunkTextByCharacterCount,
} from "@/lib/text-chunking-utils";

export interface EntityStagingResult {
  success: boolean;
  entityCount: number;
  stagedEntities?: Array<{
    id: string;
    entityType: string;
    name: string;
    content: unknown;
    metadata: Record<string, unknown>;
    relations: Array<{
      relationshipType: string;
      targetId: string;
      strength?: number | null;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  error?: string;
}

export interface EntityStagingOptions {
  env: Env;
  username: string;
  campaignId: string;
  campaignName: string;
  resource: any; // CampaignResource
  campaignRagBasePath: string;
  /**
   * OpenAI API key for entity extraction.
   * Required for entity extraction using GPT-4o.
   */
  openaiApiKey?: string;
  /**
   * Optional content extraction provider.
   * If not provided, defaults to DirectFileContentExtractionProvider.
   */
  contentExtractionProvider?: ContentExtractionProvider;
}

/**
 * Extract entities from file content and stage them for approval.
 * Entities are stored with shardStatus='staging' in metadata (UI uses "shard" terminology).
 *
 * Content extraction is handled by a ContentExtractionProvider (defaults to DirectFileContentExtractionProvider).
 * Large PDFs are automatically chunked and entities are merged across chunks.
 */
export async function stageEntitiesFromResource(
  options: EntityStagingOptions
): Promise<EntityStagingResult> {
  const {
    env,
    username,
    campaignId,
    campaignName,
    resource,
    campaignRagBasePath,
    openaiApiKey,
    contentExtractionProvider,
  } = options;

  try {
    // Validate and normalize resource
    validateShardGenerationOptions({
      env,
      username,
      campaignId,
      campaignName,
      resource,
      campaignRagBasePath,
    });

    if (!openaiApiKey) {
      console.warn(
        `[EntityStaging] No OpenAI API key provided, skipping entity extraction for resource: ${resource.id}`
      );
      return {
        success: true,
        entityCount: 0,
        stagedEntities: [],
      };
    }

    const normalizedResource = normalizeResourceForShardGeneration(resource);

    console.log(
      `[EntityStaging] Starting entity extraction for resource: ${normalizedResource.id}`
    );

    // Use content extraction provider (defaults to DirectFileContentExtractionProvider if not provided)
    const provider =
      contentExtractionProvider ||
      new DirectFileContentExtractionProvider(env, new R2Helper(env));

    const extractionResult = await provider.extractContent({
      resource: normalizedResource,
    });

    if (!extractionResult.success || !extractionResult.content) {
      console.warn(
        `[EntityStaging] Content extraction failed for resource: ${normalizedResource.id}`,
        extractionResult.error
      );
      return {
        success: true,
        entityCount: 0,
        stagedEntities: [],
      };
    }

    const fileContent = extractionResult.content;
    const isPDF = extractionResult.metadata?.isPDF || false;

    // Chunk content to respect GPT-4o TPM (tokens per minute) limits: 30,000 tokens per request
    // Token estimation: ~4 characters per token for English text
    // We need to account for:
    // - System prompt: ~3,000 tokens
    // - Max response: ~16,384 tokens (MAX_EXTRACTION_RESPONSE_TOKENS)
    // - Content: 30,000 - 3,000 - 16,384 = ~10,616 tokens = ~42,000 characters
    // Using conservative estimate to leave safety margin for prompt variations
    const CHARS_PER_TOKEN = 4;
    const PROMPT_TOKENS_ESTIMATE = 3000;
    const MAX_RESPONSE_TOKENS = 16384;
    const TPM_LIMIT = 30000;
    const MAX_CONTENT_TOKENS =
      TPM_LIMIT - PROMPT_TOKENS_ESTIMATE - MAX_RESPONSE_TOKENS;
    const MAX_CHUNK_SIZE = Math.floor(MAX_CONTENT_TOKENS * CHARS_PER_TOKEN); // ~42k characters (~10.6k tokens)

    const chunks =
      fileContent.length > MAX_CHUNK_SIZE
        ? isPDF
          ? chunkTextByPages(fileContent, MAX_CHUNK_SIZE)
          : chunkTextByCharacterCount(fileContent, MAX_CHUNK_SIZE)
        : [fileContent];

    console.log(
      `[EntityStaging] Processing ${chunks.length} chunk(s) for resource: ${normalizedResource.id} (max chunk size: ${MAX_CHUNK_SIZE} chars, ~${Math.floor(MAX_CHUNK_SIZE / CHARS_PER_TOKEN)} tokens)`
    );

    // Extract entities from each chunk and merge results
    const extractionService = new EntityExtractionService(openaiApiKey);
    const allExtractedEntities: Map<string, ExtractedEntity> = new Map();

    // Rate limit: Process chunks with delay to respect TPM limits
    // If processing multiple chunks, add a delay to stay under 30k tokens per minute
    const CHUNK_PROCESSING_DELAY_MS = chunks.length > 1 ? 2000 : 0; // 2 second delay between chunks

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Add delay before processing (except for first chunk)
      if (i > 0 && CHUNK_PROCESSING_DELAY_MS > 0) {
        console.log(
          `[EntityStaging] Rate limiting: waiting ${CHUNK_PROCESSING_DELAY_MS}ms before processing chunk ${i + 1}/${chunks.length}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_PROCESSING_DELAY_MS)
        );
      }
      const chunkEntities = await extractionService.extractEntities({
        content: chunk,
        sourceName: normalizedResource.file_name || normalizedResource.id,
        campaignId,
        sourceId: normalizedResource.id,
        sourceType: "file_upload",
        openaiApiKey,
        metadata: {
          fileKey: normalizedResource.file_key || normalizedResource.id,
          resourceId: normalizedResource.id,
          resourceName: normalizedResource.file_name || normalizedResource.id,
          staged: true,
          shardStatus: "staging",
          chunkIndex: i,
          totalChunks: chunks.length,
        },
      });

      // Merge entities by ID (same entity ID = merge content/metadata)
      for (const entity of chunkEntities) {
        const existing = allExtractedEntities.get(entity.id);
        if (existing) {
          // Merge: combine content, merge relations, update metadata
          existing.content = {
            ...(typeof existing.content === "object" &&
            existing.content !== null
              ? existing.content
              : {}),
            ...(typeof entity.content === "object" && entity.content !== null
              ? entity.content
              : {}),
          };
          // Merge relations (avoid duplicates)
          const existingTargetIds = new Set(
            existing.relations.map((r) => r.targetId)
          );
          for (const rel of entity.relations) {
            if (!existingTargetIds.has(rel.targetId)) {
              existing.relations.push(rel);
              existingTargetIds.add(rel.targetId);
            }
          }
          // Update metadata
          existing.metadata = {
            ...existing.metadata,
            ...entity.metadata,
          };
        } else {
          allExtractedEntities.set(entity.id, entity);
        }
      }
    }

    const extractedEntities = Array.from(allExtractedEntities.values());

    console.log(
      `[EntityStaging] Extracted ${extractedEntities.length} total entities (after merging chunks) for resource: ${normalizedResource.id}`
    );

    if (extractedEntities.length === 0) {
      console.log(
        `[EntityStaging] No entities extracted from resource: ${normalizedResource.id}`
      );
      return {
        success: true,
        entityCount: 0,
        stagedEntities: [],
      };
    }

    // Store entities with staging status in metadata
    const daoFactory = getDAOFactory(env);
    const stagedEntities: EntityStagingResult["stagedEntities"] = [];
    let skippedCount = 0;
    let updatedCount = 0;
    let createdCount = 0;

    // Update relationships to use campaign-scoped IDs
    // Entity IDs from extraction are already campaign-scoped, but relationships may reference base IDs
    // Ensure all relationship targetIds have the campaign prefix
    for (const extracted of extractedEntities) {
      extracted.relations = extracted.relations.map((rel) => {
        let targetId = rel.targetId;
        // If target ID doesn't start with campaign prefix, add it
        if (!targetId.startsWith(`${campaignId}_`)) {
          targetId = `${campaignId}_${targetId}`;
        }
        return {
          ...rel,
          targetId,
        };
      });
    }

    for (const extracted of extractedEntities) {
      // Entity IDs are already campaign-scoped from extraction
      const entityId = extracted.id;

      // Update relationships to use campaign-scoped IDs
      const updatedRelations = extracted.relations;

      // Store entity with staging status and relations (for later approval)
      const entityMetadata = {
        ...extracted.metadata,
        shardStatus: "staging" as const,
        staged: true,
        resourceId: normalizedResource.id,
        resourceName: normalizedResource.file_name || normalizedResource.id,
        fileKey: normalizedResource.file_key || normalizedResource.id,
        // Store relations in metadata so they can be created during approval (with updated target IDs)
        pendingRelations: updatedRelations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      };

      if (updatedRelations.length > 0) {
        console.log(
          `[EntityStaging] Storing ${updatedRelations.length} pending relationships for entity ${entityId} (${extracted.name}):`,
          updatedRelations.map((r) => `${r.relationshipType} -> ${r.targetId}`)
        );
      }

      // Check if entity already exists (entity IDs are campaign-scoped with campaign prefix)
      const existing = await daoFactory.entityDAO.getEntityById(entityId);

      if (existing) {
        // Entity exists in the current campaign
        const existingMetadata =
          (existing.metadata as Record<string, unknown>) || {};
        if (existingMetadata.shardStatus === "approved") {
          // Don't overwrite approved entities
          console.log(
            `[EntityStaging] Entity ${entityId} (${extracted.name}) already approved, skipping`
          );
          skippedCount++;
          continue;
        }
        await daoFactory.entityDAO.updateEntity(entityId, {
          name: extracted.name,
          content: extracted.content,
          metadata: entityMetadata,
          confidence: extracted.metadata.confidence as number | null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
        updatedCount++;
      } else {
        // Entity doesn't exist - create new entity
        await daoFactory.entityDAO.createEntity({
          id: entityId,
          campaignId,
          entityType: extracted.entityType,
          name: extracted.name,
          content: extracted.content,
          metadata: entityMetadata,
          confidence: (extracted.metadata.confidence as number) || null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
        createdCount++;
      }

      // Create relationships immediately with staging status so importance can be calculated
      const graphService = new EntityGraphService(daoFactory.entityDAO);
      for (const rel of updatedRelations) {
        try {
          await graphService.upsertEdge({
            campaignId,
            fromEntityId: entityId,
            toEntityId: rel.targetId,
            relationshipType: rel.relationshipType,
            strength: rel.strength,
            metadata: {
              ...(rel.metadata as Record<string, unknown>),
              status: "staging",
            },
            allowSelfRelation: false,
          });
        } catch (error) {
          console.warn(
            `[EntityStaging] Failed to create relationship ${entityId} -> ${rel.targetId}:`,
            error
          );
        }
      }

      // Store staged entity info
      stagedEntities.push({
        id: entityId,
        entityType: extracted.entityType,
        name: extracted.name,
        content: extracted.content,
        metadata: entityMetadata,
        relations: updatedRelations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      });
    }

    // Calculate importance for all entities in batch (including newly staged entities)
    // This is much more efficient than calculating per-entity, as it runs PageRank
    // and Betweenness Centrality once for the entire graph instead of N times
    if (stagedEntities.length > 0) {
      try {
        const importanceService = new EntityImportanceService(
          daoFactory.entityDAO,
          daoFactory.communityDAO,
          daoFactory.entityImportanceDAO
        );

        console.log(
          `[EntityStaging] Calculating importance scores in batch for ${stagedEntities.length} newly staged entities`
        );

        // Batch calculate importance for all entities in the campaign
        // This calculates PageRank and Betweenness Centrality once, then
        // calculates hierarchy level for each entity
        await importanceService.recalculateImportanceForCampaign(campaignId);

        console.log(
          `[EntityStaging] Batch importance calculation completed for campaign: ${campaignId}`
        );
      } catch (error) {
        console.error(
          `[EntityStaging] Failed to calculate importance in batch:`,
          error
        );
        // Continue even if importance calculation fails - entities are still staged
      }
    }

    console.log(
      `[EntityStaging] Staged ${stagedEntities.length} entities for resource: ${normalizedResource.id} (${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped - already approved)`
    );

    // Send notification about staged entities
    try {
      await notifyShardGeneration(
        env,
        username,
        campaignName,
        normalizedResource.file_name || normalizedResource.id,
        stagedEntities.length,
        { campaignId, resourceId: normalizedResource.id }
      );
    } catch (notifyError) {
      console.error(
        "[EntityStaging] Failed to send notification:",
        notifyError
      );
    }

    return {
      success: true,
      entityCount: stagedEntities.length,
      stagedEntities,
    };
  } catch (error) {
    console.error(`[EntityStaging] Error staging entities:`, error);
    return {
      success: false,
      entityCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
