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

/**
 * Chunk text by pages (for PDFs) or by character count to stay under token limits
 * Pages are identified by [Page N] markers added during PDF extraction
 */
function chunkTextByPages(text: string, maxChunkSize: number): string[] {
  // Split by page markers
  const pagePattern = /\[Page \d+\]/g;
  const pages = text.split(pagePattern);
  const pageMarkers = text.match(pagePattern) || [];

  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < pages.length; i++) {
    const pageMarker = i > 0 ? pageMarkers[i - 1] : "";
    const pageContent = pages[i];

    // If adding this page would exceed the limit, start a new chunk
    if (
      currentChunk.length > 0 &&
      currentChunk.length + pageMarker.length + pageContent.length >
        maxChunkSize
    ) {
      chunks.push(currentChunk);
      currentChunk = pageMarker + pageContent;
    } else {
      currentChunk += pageMarker + pageContent;
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text];
}

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

    // Chunk content if it's a large PDF (estimate ~4 chars per token, max ~128k tokens for gpt-4o)
    // We'll use a conservative limit of ~400k characters to stay well under token limits
    const MAX_CHUNK_SIZE = 400000; // ~100k tokens
    const chunks =
      isPDF && fileContent.length > MAX_CHUNK_SIZE
        ? chunkTextByPages(fileContent, MAX_CHUNK_SIZE)
        : [fileContent];

    console.log(
      `[EntityStaging] Processing ${chunks.length} chunk(s) for resource: ${normalizedResource.id}`
    );

    // Extract entities from each chunk and merge results
    const extractionService = new EntityExtractionService(openaiApiKey);
    const allExtractedEntities: Map<string, ExtractedEntity> = new Map();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
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

      // Store staged entity info (without persisting relationships yet - those come after approval)
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
