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
import { SemanticDuplicateDetectionService } from "@/services/vectorize/semantic-duplicate-detection-service";
import { CharacterSheetDetectionService } from "@/services/character-sheet/character-sheet-detection-service";
import { CharacterSheetParserService } from "@/services/character-sheet/character-sheet-parser-service";
import { mergeEntityContent, isStubContent } from "@/lib/entity-content-merge";
import { normalizeEntityType } from "@/lib/entity-types";

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
  warning?: string;
  failedChunks?: number[];
  successfulChunks?: number;
  totalChunks?: number;
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

    // Check if this is a character sheet before normal entity extraction
    try {
      const detectionService = new CharacterSheetDetectionService(openaiApiKey);
      const detectionResult =
        await detectionService.detectCharacterSheet(fileContent);

      if (detectionService.isConfidentDetection(detectionResult)) {
        console.log(
          `[EntityStaging] Character sheet detected for resource: ${normalizedResource.id} (confidence: ${detectionResult.confidence}, character: ${detectionResult.characterName || "unknown"})`
        );

        // Parse the character sheet
        const parserService = new CharacterSheetParserService(openaiApiKey);
        const characterData = await parserService.parseCharacterSheet(
          fileContent,
          detectionResult.characterName || undefined
        );

        // Create PC entity from parsed character data
        const daoFactory = getDAOFactory(env);
        const characterName =
          characterData.name ||
          detectionResult.characterName ||
          "Unknown Character";
        const baseId = crypto.randomUUID();
        const pcEntityId = `${campaignId}_${baseId}`;

        // Check for duplicate by name and type before creating
        const existingPC = await daoFactory.entityDAO.findEntityByNameAndType(
          campaignId,
          characterName,
          "pcs"
        );

        let finalEntityId: string;
        let finalMetadata: Record<string, unknown>;

        if (existingPC) {
          console.log(
            `[EntityStaging] PC with name "${characterName}" already exists (${existingPC.id}), updating instead of creating duplicate`
          );
          finalEntityId = existingPC.id;
          finalMetadata = {
            ...((existingPC.metadata as Record<string, unknown>) || {}),
            shardStatus: "staging",
            staged: true,
            resourceId: normalizedResource.id,
            resourceName: normalizedResource.file_name || normalizedResource.id,
            fileKey: normalizedResource.file_key || normalizedResource.id,
            isCharacterSheet: true,
            detectedGameSystem: detectionResult.detectedGameSystem,
          };
          // Update existing PC entity with new character data
          await daoFactory.entityDAO.updateEntity(existingPC.id, {
            content: characterData,
            metadata: finalMetadata,
            sourceType: "file_upload",
            sourceId: normalizedResource.id,
          });
        } else {
          // Create new PC entity
          finalEntityId = pcEntityId;
          finalMetadata = {
            shardStatus: "staging",
            staged: true,
            resourceId: normalizedResource.id,
            resourceName: normalizedResource.file_name || normalizedResource.id,
            fileKey: normalizedResource.file_key || normalizedResource.id,
            isCharacterSheet: true,
            detectedGameSystem: detectionResult.detectedGameSystem,
          };
          await daoFactory.entityDAO.createEntity({
            id: pcEntityId,
            campaignId,
            entityType: "pcs",
            name: characterName,
            content: characterData,
            metadata: finalMetadata,
            sourceType: "file_upload",
            sourceId: normalizedResource.id,
            confidence: detectionResult.confidence,
          });
          console.log(
            `[EntityStaging] Created PC entity ${pcEntityId} (${characterName}) from character sheet`
          );
        }

        // Return early with the character sheet PC entity to avoid redundant processing
        return {
          success: true,
          entityCount: 1,
          stagedEntities: [
            {
              id: finalEntityId,
              entityType: "pcs",
              name: characterName,
              content: characterData,
              metadata: finalMetadata,
              relations: [],
            },
          ],
        };
      } else {
        console.log(
          `[EntityStaging] Not a character sheet (confidence: ${detectionResult.confidence})`
        );
      }
    } catch (error) {
      // Log error but continue with normal entity extraction
      console.error(
        `[EntityStaging] Error detecting/parsing character sheet for resource ${normalizedResource.id}:`,
        error
      );
      console.log(
        `[EntityStaging] Continuing with normal entity extraction despite character sheet detection error`
      );
    }

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
    const MAX_CHUNK_RETRIES = 3; // Maximum retry attempts per chunk
    const INITIAL_RETRY_DELAY_MS = 2000; // Initial delay for retries (2 seconds)
    const MAX_RETRY_DELAY_MS = 30000; // Maximum delay for retries (30 seconds)

    const failedChunks: number[] = [];
    const chunkRetryCounts: Map<number, number> = new Map(); // Track retry count per chunk index
    const chunksToRetry: number[] = []; // Chunks that need retrying
    let successfulChunks = 0;

    // Helper function to process a single chunk
    const processChunk = async (
      chunkIndex: number,
      chunk: string,
      isRetry: boolean = false
    ): Promise<boolean> => {
      const chunkNumber = chunkIndex + 1;
      const retryCount = chunkRetryCounts.get(chunkIndex) || 0;

      // Add delay before processing (except for first chunk on initial pass)
      if (!isRetry && chunkIndex > 0 && CHUNK_PROCESSING_DELAY_MS > 0) {
        console.log(
          `[EntityStaging] Rate limiting: waiting ${CHUNK_PROCESSING_DELAY_MS}ms before processing chunk ${chunkNumber}/${chunks.length}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_PROCESSING_DELAY_MS)
        );
      }

      // Add exponential backoff delay for retries
      if (isRetry && retryCount > 0) {
        const backoffDelay = Math.min(
          INITIAL_RETRY_DELAY_MS * 2 ** (retryCount - 1),
          MAX_RETRY_DELAY_MS
        );
        console.log(
          `[EntityStaging] Retrying chunk ${chunkNumber} (attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES + 1}), waiting ${backoffDelay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      try {
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
            chunkIndex: chunkIndex,
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

        // Success - remove from retry tracking if it was a retry
        if (isRetry) {
          chunkRetryCounts.delete(chunkIndex);
          console.log(
            `[EntityStaging] Successfully retried chunk ${chunkNumber} after ${retryCount} failed attempts`
          );
        }
        return true;
      } catch (chunkError) {
        // Log error
        const errorMessage =
          chunkError instanceof Error ? chunkError.message : "Unknown error";
        const isRateLimit =
          errorMessage.includes("rate limit") ||
          errorMessage.includes("429") ||
          errorMessage.includes("Too Many Requests");

        if (isRetry) {
          console.error(
            `[EntityStaging] Retry attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES} failed for chunk ${chunkNumber}:`,
            errorMessage
          );
        } else {
          console.error(
            `[EntityStaging] Error extracting entities from chunk ${chunkNumber}/${chunks.length} for resource ${normalizedResource.id}:`,
            errorMessage
          );
        }

        // Check if we should retry
        if (retryCount < MAX_CHUNK_RETRIES) {
          // Increment retry count and schedule retry
          chunkRetryCounts.set(chunkIndex, retryCount + 1);

          // For rate limits, wait longer before continuing to next chunk
          if (isRateLimit && !isRetry) {
            const rateLimitWaitMs = 5000; // Wait 5 seconds for rate limit
            console.log(
              `[EntityStaging] Rate limit detected, waiting ${rateLimitWaitMs}ms before processing next chunk`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, rateLimitWaitMs)
            );
          }

          return false; // Indicates failure but will be retried
        } else {
          // Max retries exceeded - mark as permanently failed
          console.error(
            `[EntityStaging] Chunk ${chunkNumber} failed after ${MAX_CHUNK_RETRIES} retry attempts, giving up`
          );
          failedChunks.push(chunkNumber);
          chunkRetryCounts.delete(chunkIndex);
          return false; // Permanently failed
        }
      }
    };

    // Initial pass: process all chunks
    for (let i = 0; i < chunks.length; i++) {
      const success = await processChunk(i, chunks[i], false);
      if (success) {
        successfulChunks++;
      } else {
        // Check if it will be retried (retry count hasn't exceeded max)
        const retryCount = chunkRetryCounts.get(i) || 0;
        if (retryCount < MAX_CHUNK_RETRIES) {
          chunksToRetry.push(i);
        }
      }
    }

    // Retry failed chunks
    while (chunksToRetry.length > 0) {
      const chunkIndex = chunksToRetry.shift()!;
      const retryCount = chunkRetryCounts.get(chunkIndex) || 0;

      if (retryCount >= MAX_CHUNK_RETRIES) {
        // Already exceeded max retries, skip
        continue;
      }

      const success = await processChunk(chunkIndex, chunks[chunkIndex], true);
      if (success) {
        successfulChunks++;
      } else {
        // Check if we should retry again
        const newRetryCount = chunkRetryCounts.get(chunkIndex) || 0;
        if (newRetryCount < MAX_CHUNK_RETRIES) {
          // Add back to retry queue
          chunksToRetry.push(chunkIndex);
        }
      }
    }

    // Log summary of chunk processing
    if (failedChunks.length > 0) {
      console.warn(
        `[EntityStaging] Partial success: ${successfulChunks}/${chunks.length} chunks processed successfully. Failed chunks: ${failedChunks.join(", ")}`
      );
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
    let duplicateCount = 0;

    type RelationPayload = {
      fromEntityId: string;
      toEntityId: string;
      relationshipType: string;
      strength: number | null;
      metadata: Record<string, unknown>;
    };
    const relationPayloads: RelationPayload[] = [];

    /** Deep equality for content; used to skip approved entities when no new information. */
    function contentUnchanged(
      existingContent: unknown,
      mergedContent: unknown
    ): boolean {
      const normalized = (v: unknown): string => {
        if (v === null || v === undefined) return JSON.stringify(v);
        if (typeof v !== "object") return JSON.stringify(v);
        if (Array.isArray(v)) return JSON.stringify(v.map(normalized));
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o).sort();
        return JSON.stringify(keys.map((k) => [k, normalized(o[k])]));
      };
      return normalized(existingContent) === normalized(mergedContent);
    }

    /** Keys that change every staging run; exclude when comparing metadata for "unchanged". */
    const META_RUN_KEYS = new Set([
      "resourceId",
      "resourceName",
      "fileKey",
      "pendingRelations",
      "stagedFrom",
      "stagedAt",
    ]);
    function metaUnchanged(
      existingMeta: Record<string, unknown>,
      mergedMeta: Record<string, unknown>
    ): boolean {
      const strip = (m: Record<string, unknown>): Record<string, unknown> => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(m)) {
          if (!META_RUN_KEYS.has(k)) o[k] = m[k];
        }
        return o;
      };
      return contentUnchanged(strip(existingMeta), strip(mergedMeta));
    }

    // Update relationships to use campaign-scoped IDs
    for (const extracted of extractedEntities) {
      extracted.relations = extracted.relations.map((rel) => {
        let targetId = rel.targetId;
        if (!targetId.startsWith(`${campaignId}_`)) {
          targetId = `${campaignId}_${targetId}`;
        }
        return { ...rel, targetId };
      });
    }

    // Pass 1: create or update all entities only; collect relationship payloads
    for (const extracted of extractedEntities) {
      const entityId = extracted.id;
      const updatedRelations = extracted.relations;
      const entityType = normalizeEntityType(extracted.entityType ?? "");

      const entityMetadata: Record<string, unknown> = {
        ...extracted.metadata,
        shardStatus: "staging" as const,
        staged: true,
        resourceId: normalizedResource.id,
        resourceName: normalizedResource.file_name || normalizedResource.id,
        fileKey: normalizedResource.file_key || normalizedResource.id,
        pendingRelations: updatedRelations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      };

      const existing = await daoFactory.entityDAO.getEntityById(entityId);
      const normalizedName = (extracted.name ?? "").trim();

      if (existing) {
        const existingMetadata =
          (existing.metadata as Record<string, unknown>) || {};
        const mergedContent = mergeEntityContent(
          existing.content,
          extracted.content
        );
        const mergedMetaBase = {
          ...existingMetadata,
          ...entityMetadata,
          isStub: !!isStubContent(mergedContent, entityType),
        };
        const mergedMeta =
          existingMetadata.shardStatus === "approved"
            ? { ...mergedMetaBase, shardStatus: "approved" as const }
            : { ...mergedMetaBase, shardStatus: "staging" as const };
        if (existingMetadata.shardStatus === "approved") {
          if (
            contentUnchanged(existing.content, mergedContent) &&
            metaUnchanged(existingMetadata, mergedMeta)
          ) {
            console.log(
              `[EntityStaging] Entity ${entityId} (${extracted.name}) already approved and unchanged, skipping`
            );
            skippedCount++;
            continue;
          }
          console.log(
            `[EntityStaging] Entity ${entityId} (${extracted.name}) approved but has new information, updating`
          );
        }
        await daoFactory.entityDAO.updateEntity(entityId, {
          name: normalizedName,
          content: mergedContent,
          metadata: mergedMeta,
          confidence: (extracted.metadata.confidence as number) ?? null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
        updatedCount++;
        for (const rel of updatedRelations) {
          relationPayloads.push({
            fromEntityId: entityId,
            toEntityId: rel.targetId,
            relationshipType: rel.relationshipType,
            strength: rel.strength ?? null,
            metadata: {
              ...(rel.metadata as Record<string, unknown>),
              status: "staging",
            },
          });
        }
        stagedEntities.push({
          id: entityId,
          entityType,
          name: normalizedName,
          content: mergedContent,
          metadata: mergedMeta,
          relations: updatedRelations.map((rel) => ({
            relationshipType: rel.relationshipType,
            targetId: rel.targetId,
            strength: rel.strength,
            metadata: rel.metadata,
          })),
        });
        continue;
      }

      const entityText =
        typeof extracted.content === "string"
          ? extracted.content
          : JSON.stringify(extracted.content || {});
      const contentForSemantic = `${normalizedName} ${entityText}`.trim();
      const duplicateEntity =
        await SemanticDuplicateDetectionService.findDuplicateEntity({
          content: contentForSemantic,
          campaignId,
          name: normalizedName,
          entityType,
          excludeEntityId: entityId,
          env,
          openaiApiKey,
        });

      if (duplicateEntity) {
        const existingMetadata =
          (duplicateEntity.metadata as Record<string, unknown>) || {};
        const mergedContent = mergeEntityContent(
          duplicateEntity.content,
          extracted.content
        );
        const sufficient = !isStubContent(mergedContent, entityType);
        const mergedMetaBase = {
          ...existingMetadata,
          ...entityMetadata,
          isStub: sufficient ? false : (existingMetadata.isStub ?? true),
        };
        const mergedMeta =
          existingMetadata.shardStatus === "approved"
            ? { ...mergedMetaBase, shardStatus: "approved" as const }
            : { ...mergedMetaBase, shardStatus: "staging" as const };
        if (existingMetadata.shardStatus === "approved") {
          if (
            contentUnchanged(duplicateEntity.content, mergedContent) &&
            metaUnchanged(existingMetadata, mergedMeta)
          ) {
            console.log(
              `[EntityStaging] Duplicate "${extracted.name}" already approved and unchanged, skipping`
            );
            duplicateCount++;
            continue;
          }
          console.log(
            `[EntityStaging] Duplicate "${extracted.name}" approved but has new information, updating`
          );
        }
        await daoFactory.entityDAO.updateEntity(duplicateEntity.id, {
          name: normalizedName,
          content: mergedContent,
          metadata: mergedMeta,
          confidence: (extracted.metadata.confidence as number) ?? null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
        updatedCount++;
        for (const rel of updatedRelations) {
          relationPayloads.push({
            fromEntityId: duplicateEntity.id,
            toEntityId: rel.targetId,
            relationshipType: rel.relationshipType,
            strength: rel.strength ?? null,
            metadata: {
              ...(rel.metadata as Record<string, unknown>),
              status: "staging",
            },
          });
        }
        stagedEntities.push({
          id: duplicateEntity.id,
          entityType,
          name: normalizedName,
          content: mergedContent,
          metadata: mergedMeta,
          relations: updatedRelations.map((rel) => ({
            relationshipType: rel.relationshipType,
            targetId: rel.targetId,
            strength: rel.strength,
            metadata: rel.metadata,
          })),
        });
        continue;
      }

      const isStub = isStubContent(extracted.content, entityType);
      const newMeta = { ...entityMetadata, isStub };
      await daoFactory.entityDAO.createEntity({
        id: entityId,
        campaignId,
        entityType,
        name: normalizedName,
        content: extracted.content,
        metadata: newMeta,
        confidence: (extracted.metadata.confidence as number) ?? null,
        sourceType: "file_upload",
        sourceId: normalizedResource.id,
      });
      createdCount++;
      for (const rel of updatedRelations) {
        relationPayloads.push({
          fromEntityId: entityId,
          toEntityId: rel.targetId,
          relationshipType: rel.relationshipType,
          strength: rel.strength ?? null,
          metadata: {
            ...(rel.metadata as Record<string, unknown>),
            status: "staging",
          },
        });
      }
      stagedEntities.push({
        id: entityId,
        entityType,
        name: extracted.name,
        content: extracted.content,
        metadata: newMeta,
        relations: updatedRelations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      });
    }

    // Pass 2: create all relationships (all entities now exist)
    const graphService = new EntityGraphService(daoFactory.entityDAO);
    for (const rel of relationPayloads) {
      try {
        await graphService.upsertEdge({
          campaignId,
          fromEntityId: rel.fromEntityId,
          toEntityId: rel.toEntityId,
          relationshipType: rel.relationshipType,
          strength: rel.strength,
          metadata: rel.metadata,
          allowSelfRelation: false,
        });
      } catch (error) {
        console.warn(
          `[EntityStaging] Failed to create relationship ${rel.fromEntityId} -> ${rel.toEntityId}:`,
          error
        );
      }
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
      `[EntityStaging] Staged ${stagedEntities.length} entities for resource: ${normalizedResource.id} (${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped - already approved, ${duplicateCount} skipped - semantic duplicates)`
    );

    // Send notification about staged entities
    try {
      let notificationMessage = "";
      if (failedChunks.length > 0 && stagedEntities.length > 0) {
        // Partial success: some chunks failed but we still got entities
        // Calculate percentage for user-friendly message
        const successRate = Math.round(
          (successfulChunks / chunks.length) * 100
        );
        notificationMessage = `⚠️ We extracted ${stagedEntities.length} shards, but couldn't process some parts of the file (${successRate}% processed successfully). This usually happens when processing very large files. You can retry to process the remaining content.`;
      } else if (failedChunks.length > 0 && stagedEntities.length === 0) {
        // All chunks failed
        notificationMessage = `❌ We couldn't extract any shards from this file. This may be due to the file being too large or temporary processing issues. Please try again later.`;
      }

      await notifyShardGeneration(
        env,
        username,
        campaignName,
        normalizedResource.file_name || normalizedResource.id,
        stagedEntities.length,
        {
          campaignId,
          resourceId: normalizedResource.id,
          ...(notificationMessage ? { errorMessage: notificationMessage } : {}),
        }
      );
    } catch (notifyError) {
      console.error(
        "[EntityStaging] Failed to send notification:",
        notifyError
      );
    }

    // Return success if we got any entities, even if some chunks failed
    return {
      success: stagedEntities.length > 0 || failedChunks.length === 0,
      entityCount: stagedEntities.length,
      stagedEntities,
      ...(failedChunks.length > 0
        ? {
            warning: `Some chunks failed to process: ${failedChunks.join(", ")}`,
            failedChunks,
            successfulChunks,
            totalChunks: chunks.length,
          }
        : {}),
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
