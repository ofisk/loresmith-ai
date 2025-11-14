// Entity staging service for campaign resources
// Extracts entities from file content and stages them for user approval/rejection
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { notifyShardGeneration } from "@/lib/notifications";
import type { Env } from "@/middleware/auth";
import {
  normalizeResourceForShardGeneration,
  getAutoRAGSearchPath,
  validateSearchPath,
  logShardGenerationContext,
  validateShardGenerationOptions,
} from "@/lib/shard-generation-utils";
import type { ContentExtractionProvider } from "./content-extraction-provider";
import { AutoRAGContentExtractionProvider } from "./impl/autorag-content-extraction-provider";

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
   * Optional content extraction provider.
   * If not provided, defaults to AutoRAGContentExtractionProvider.
   */
  contentExtractionProvider?: ContentExtractionProvider;
}

/**
 * Extract entities from file content and stage them for approval.
 * Entities are stored with shardStatus='staging' in metadata (UI uses "shard" terminology).
 *
 * Content extraction is handled by a ContentExtractionProvider (defaults to AutoRAG).
 * To use a different extraction method, provide a custom provider via options.
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

    const normalizedResource = normalizeResourceForShardGeneration(resource);
    const searchPath = getAutoRAGSearchPath(normalizedResource);
    validateSearchPath(searchPath);
    logShardGenerationContext(normalizedResource, searchPath, campaignId);

    console.log(
      `[EntityStaging] Starting entity extraction for resource: ${normalizedResource.id}`
    );

    // Use content extraction provider (defaults to AutoRAG if not provided)
    const provider =
      contentExtractionProvider ||
      new AutoRAGContentExtractionProvider(env, username);

    const extractionResult = await provider.extractContent({
      resource: normalizedResource,
      searchPath,
      maxResults: 50,
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

    // Extract entities from the content
    const extractionService = new EntityExtractionService(env);
    const extractedEntities = await extractionService.extractEntities({
      content: fileContent,
      sourceName: normalizedResource.file_name || normalizedResource.id,
      campaignId,
      sourceId: normalizedResource.id,
      sourceType: "file_upload",
      metadata: {
        fileKey: normalizedResource.file_key || normalizedResource.id,
        resourceId: normalizedResource.id,
        resourceName: normalizedResource.file_name || normalizedResource.id,
        staged: true,
        shardStatus: "staging", // Mark as staging for approval workflow
      },
    });

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

    for (const extracted of extractedEntities) {
      // Store entity with staging status and relations (for later approval)
      const entityMetadata = {
        ...extracted.metadata,
        shardStatus: "staging" as const,
        staged: true,
        resourceId: normalizedResource.id,
        resourceName: normalizedResource.file_name || normalizedResource.id,
        fileKey: normalizedResource.file_key || normalizedResource.id,
        // Store relations in metadata so they can be created during approval
        pendingRelations: extracted.relations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      };

      // Check if entity already exists
      const existing = await daoFactory.entityDAO.getEntityById(extracted.id);

      if (existing) {
        // Update existing entity with staging metadata (preserve existing if already approved)
        const existingMetadata =
          (existing.metadata as Record<string, unknown>) || {};
        if (existingMetadata.shardStatus === "approved") {
          // Don't overwrite approved entities
          console.log(
            `[EntityStaging] Entity ${extracted.id} already approved, skipping`
          );
          continue;
        }
        await daoFactory.entityDAO.updateEntity(extracted.id, {
          name: extracted.name,
          content: extracted.content,
          metadata: entityMetadata,
          confidence: extracted.metadata.confidence as number | null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
      } else {
        // Create new entity with staging status
        await daoFactory.entityDAO.createEntity({
          id: extracted.id,
          campaignId,
          entityType: extracted.entityType,
          name: extracted.name,
          content: extracted.content,
          metadata: entityMetadata,
          confidence: (extracted.metadata.confidence as number) || null,
          sourceType: "file_upload",
          sourceId: normalizedResource.id,
        });
      }

      // Store staged entity info (without persisting relationships yet - those come after approval)
      stagedEntities.push({
        id: extracted.id,
        entityType: extracted.entityType,
        name: extracted.name,
        content: extracted.content,
        metadata: entityMetadata,
        relations: extracted.relations.map((rel) => ({
          relationshipType: rel.relationshipType,
          targetId: rel.targetId,
          strength: rel.strength,
          metadata: rel.metadata,
        })),
      });
    }

    console.log(
      `[EntityStaging] Staged ${stagedEntities.length} entities for resource: ${normalizedResource.id}`
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
