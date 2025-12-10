import { getDAOFactory } from "@/dao/dao-factory";
import type { EntityDAO } from "@/dao/entity-dao";
import type { AuthPayload } from "@/services/core/auth-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityExtractionPipeline } from "@/services/rag/entity-extraction-pipeline";
import { EntityDeduplicationService } from "@/services/rag/entity-deduplication-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { DirectFileContentExtractionProvider } from "@/services/campaign/impl/direct-file-content-extraction-provider";
import { R2Helper } from "@/lib/r2";
import {
  chunkTextByCharacterCount,
  chunkTextByPages,
} from "@/lib/text-chunking-utils";
import {
  mapOverrideToScore,
  type ImportanceLevel,
} from "@/lib/importance-config";
import {
  type ContextWithAuth,
  getUserAuth,
  ensureCampaignAccess,
} from "@/lib/route-utils";

interface EntityServiceBundle {
  embeddingService: EntityEmbeddingService;
  extractionService: EntityExtractionService;
  pipeline: EntityExtractionPipeline;
  dedupeService: EntityDeduplicationService;
  graphService: EntityGraphService;
}

interface CampaignHandlerContext {
  c: ContextWithAuth;
  campaignId: string;
  userAuth: AuthPayload;
  entityDAO: EntityDAO;
  getServices: () => EntityServiceBundle;
}

function buildEntityServiceAccessor(
  c: ContextWithAuth,
  entityDAO: EntityDAO
): () => EntityServiceBundle {
  let bundle: EntityServiceBundle | null = null;
  return () => {
    if (!bundle) {
      const embeddingService = new EntityEmbeddingService(c.env.VECTORIZE);
      const extractionService = new EntityExtractionService(
        c.env.OPENAI_API_KEY || null
      );
      const graphService = new EntityGraphService(entityDAO);
      bundle = {
        embeddingService,
        extractionService,
        graphService,
        pipeline: new EntityExtractionPipeline(
          entityDAO,
          extractionService,
          embeddingService,
          graphService,
          c.env,
          c.env.OPENAI_API_KEY as string | undefined
        ),
        dedupeService: new EntityDeduplicationService(
          entityDAO,
          embeddingService
        ),
      };
    }
    return bundle;
  };
}

function getWorldStateService(
  c: ContextWithAuth,
  importanceService?: EntityImportanceService
): WorldStateChangelogService {
  if (!c.env.DB) {
    throw new Error("Database binding missing");
  }
  return new WorldStateChangelogService({
    db: c.env.DB,
    importanceService,
  });
}

async function withCampaignContext(
  c: ContextWithAuth,
  errorMessage: string,
  executor: (ctx: CampaignHandlerContext) => Promise<Response>
): Promise<Response> {
  try {
    const userAuth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    const hasAccess = await ensureCampaignAccess(
      c,
      campaignId,
      userAuth.username
    );
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const entityDAO = daoFactory.entityDAO;
    const getServices = buildEntityServiceAccessor(c, entityDAO);

    return await executor({
      c,
      campaignId,
      userAuth,
      entityDAO,
      getServices,
    });
  } catch (error) {
    console.error(`[Entities] ${errorMessage}:`, error);
    return c.json({ error: errorMessage }, 500);
  }
}

export async function handleListEntities(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to list entities",
    async ({ c: ctx, campaignId, entityDAO }) => {
      const entityType = ctx.req.query("entityType");
      const limit = ctx.req.query("limit");
      const offset = ctx.req.query("offset");

      const entities = await entityDAO.listEntitiesByCampaign(campaignId, {
        entityType: entityType || undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      const worldStateService = getWorldStateService(ctx);
      const overlay = await worldStateService.getOverlaySnapshot(campaignId);
      const entitiesWithOverlay = entities.map((entity) =>
        worldStateService.applyEntityOverlay(entity, overlay)
      );

      return ctx.json({ entities: entitiesWithOverlay });
    }
  );
}

export async function handleGetEntity(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to get entity",
    async ({ c: ctx, campaignId, entityDAO }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }
      const worldStateService = getWorldStateService(ctx);
      const overlay = await worldStateService.getOverlaySnapshot(campaignId);
      const entityWithOverlay = worldStateService.applyEntityOverlay(
        entity,
        overlay
      );
      return ctx.json({ entity: entityWithOverlay });
    }
  );
}

export async function handleUpdateEntityImportance(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to update entity importance",
    async ({ c: ctx, campaignId, entityDAO }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const body = (await ctx.req.json()) as {
        importanceLevel: ImportanceLevel | null;
      };

      if (
        body.importanceLevel !== null &&
        !["high", "medium", "low"].includes(body.importanceLevel)
      ) {
        return ctx.json(
          { error: "importanceLevel must be 'high', 'medium', 'low', or null" },
          400
        );
      }

      const daoFactory = getDAOFactory(ctx.env);
      const importanceService = new EntityImportanceService(
        entityDAO,
        daoFactory.communityDAO,
        daoFactory.entityImportanceDAO
      );

      const currentCalculated =
        await importanceService.calculateCombinedImportance(
          campaignId,
          entityId,
          true
        );

      const metadata = (entity.metadata as Record<string, unknown>) || {};
      const finalScore = mapOverrideToScore(
        body.importanceLevel,
        currentCalculated
      );

      await entityDAO.updateEntity(entityId, {
        metadata: {
          ...metadata,
          importanceOverride: body.importanceLevel,
          importanceScore: finalScore,
        },
      });

      const updatedEntity = await entityDAO.getEntityById(entityId);
      return ctx.json({ entity: updatedEntity });
    }
  );
}

export async function handleGetEntityImportance(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to get entity importance",
    async ({ c: ctx, campaignId, entityDAO }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const daoFactory = getDAOFactory(ctx.env);
      const importanceDAO = daoFactory.entityImportanceDAO;
      const importance = await importanceDAO.getImportance(entityId);

      if (!importance) {
        return ctx.json({ error: "Importance not found" }, 404);
      }

      return ctx.json({ importance });
    }
  );
}

export async function handleListTopEntitiesByImportance(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to list top entities by importance",
    async ({ c: ctx, campaignId }) => {
      const limit = ctx.req.query("limit");
      const minScore = ctx.req.query("minScore");

      const daoFactory = getDAOFactory(ctx.env);
      const importanceDAO = daoFactory.entityImportanceDAO;

      const options = {
        limit: limit ? Number(limit) : 10,
        minScore: minScore ? Number(minScore) : undefined,
      };

      const importanceList = await importanceDAO.getImportanceForCampaign(
        campaignId,
        options
      );

      return ctx.json({ importance: importanceList });
    }
  );
}

export async function handleGetEntityRelationships(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to get relationships",
    async ({ c: ctx, campaignId, entityDAO, getServices }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const relationshipType = ctx.req.query("relationshipType");
      const { graphService } = getServices();
      try {
        const relationships = await graphService.getRelationshipsForEntity(
          campaignId,
          entityId,
          {
            relationshipType: relationshipType ?? undefined,
          }
        );
        const worldStateService = getWorldStateService(ctx);
        const overlay = await worldStateService.getOverlaySnapshot(campaignId);
        const relationshipsWithOverlay =
          worldStateService.applyRelationshipOverlay(relationships, overlay);
        return ctx.json({ relationships: relationshipsWithOverlay });
      } catch (error) {
        console.warn(
          `[Entities] Failed to fetch relationships for ${entityId}`,
          error
        );
        return ctx.json({ error: "Failed to fetch relationships" }, 400);
      }
    }
  );
}

export async function handleGetEntityNeighbors(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to get neighbors",
    async ({ c: ctx, campaignId, entityDAO, getServices }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const maxDepth = ctx.req.query("maxDepth");
      const relationshipTypes = ctx.req.query("relationshipTypes");
      const types = relationshipTypes
        ? relationshipTypes.split(",").map((value) => value.trim())
        : undefined;

      const { graphService } = getServices();
      try {
        const neighbors = await graphService.getNeighbors(
          campaignId,
          entityId,
          {
            maxDepth: maxDepth ? Number(maxDepth) : undefined,
            relationshipTypes: types,
          }
        );
        const worldStateService = getWorldStateService(ctx);
        const overlay = await worldStateService.getOverlaySnapshot(campaignId);
        const neighborsWithOverlay = neighbors.map((neighbor) => {
          const state = overlay.entityState[neighbor.entityId];
          if (!state) {
            return neighbor;
          }
          return { ...neighbor, worldState: state };
        });
        return ctx.json({ neighbors: neighborsWithOverlay });
      } catch (error) {
        console.warn(
          `[Entities] Failed to fetch neighbors for ${entityId}`,
          error
        );
        return ctx.json({ error: "Failed to fetch neighbors" }, 400);
      }
    }
  );
}

export async function handleListRelationshipTypes(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to fetch relationship types",
    async ({ c: ctx, getServices }) => {
      const { graphService } = getServices();
      return ctx.json({
        relationshipTypes: graphService.getSupportedRelationshipTypes(),
      });
    }
  );
}

export async function handleCreateEntityRelationship(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to create relationship",
    async ({ c: ctx, campaignId, entityDAO, getServices }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const body = (await ctx.req.json()) as {
        targetEntityId?: string;
        relationshipType?: string;
        strength?: number;
        metadata?: unknown;
        allowSelfRelation?: boolean;
      };

      if (!body.targetEntityId || !body.relationshipType) {
        return ctx.json(
          { error: "targetEntityId and relationshipType are required" },
          400
        );
      }

      const { graphService } = getServices();
      try {
        const relationships = await graphService.upsertEdge({
          campaignId,
          fromEntityId: entityId,
          toEntityId: body.targetEntityId,
          relationshipType: body.relationshipType,
          strength: body.strength,
          metadata: body.metadata,
          allowSelfRelation: body.allowSelfRelation ?? false,
        });

        return ctx.json({ relationships });
      } catch (error) {
        console.warn(
          `[Entities] Failed to create relationship for ${entityId}`,
          error
        );
        return ctx.json({ error: "Failed to create relationship" }, 400);
      }
    }
  );
}

export async function handleDeleteEntityRelationship(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to delete relationship",
    async ({ c: ctx, campaignId, entityDAO, getServices }) => {
      const entityId = ctx.req.param("entityId");
      const relationshipId = ctx.req.param("relationshipId");

      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }

      const { graphService } = getServices();
      try {
        await graphService.removeEdgeById(relationshipId);
        return ctx.json({ status: "deleted" });
      } catch (error) {
        console.warn(
          `[Entities] Failed to delete relationship ${relationshipId}`,
          error
        );
        return ctx.json({ error: "Failed to delete relationship" }, 400);
      }
    }
  );
}

export async function handleTriggerEntityExtraction(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Entity extraction failed",
    async ({ c: ctx, campaignId, getServices }) => {
      const requestBody = (await ctx.req.json()) as {
        sourceId: string;
        sourceType: string;
        sourceName: string;
        content: string;
        metadata?: Record<string, unknown>;
      };

      if (
        !requestBody.content ||
        !requestBody.sourceId ||
        !requestBody.sourceType ||
        !requestBody.sourceName
      ) {
        return ctx.json(
          {
            error: "sourceId, sourceType, sourceName, and content are required",
          },
          400
        );
      }

      const { pipeline, dedupeService } = getServices();

      const pipelineResult = await pipeline.run({
        campaignId,
        sourceId: requestBody.sourceId,
        sourceType: requestBody.sourceType,
        sourceName: requestBody.sourceName,
        content: requestBody.content,
        metadata: requestBody.metadata,
      });

      const deduplication = [];
      for (const entity of pipelineResult.entities) {
        const result = await dedupeService.evaluateEntity(
          campaignId,
          entity.id,
          entity.entityType
        );
        deduplication.push({
          entityId: entity.id,
          highConfidenceMatches: result.highConfidenceMatches.map((match) => ({
            entity: match.entity,
            score: match.score,
          })),
          pendingEntryId: result.pendingEntryId,
        });
      }

      return ctx.json({
        entities: pipelineResult.entities,
        relationships: pipelineResult.relationships,
        deduplication,
      });
    }
  );
}

export async function handleTriggerEntityDeduplication(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to run deduplication check",
    async ({ c: ctx, campaignId, getServices }) => {
      const body = (await ctx.req.json()) as {
        entityId: string;
        entityType?: string;
      };

      if (!body.entityId) {
        return ctx.json({ error: "entityId is required" }, 400);
      }

      const { dedupeService } = getServices();
      const result = await dedupeService.evaluateEntity(
        campaignId,
        body.entityId,
        body.entityType
      );

      return ctx.json({
        deduplication: {
          entityId: body.entityId,
          highConfidenceMatches: result.highConfidenceMatches.map((match) => ({
            entity: match.entity,
            score: match.score,
          })),
          pendingEntryId: result.pendingEntryId,
        },
      });
    }
  );
}

export async function handleListPendingDeduplication(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to list pending deduplication entries",
    async ({ c: ctx, campaignId, getServices }) => {
      const { dedupeService } = getServices();
      const entries = await dedupeService.listPendingEntries(campaignId);
      return ctx.json({ pending: entries });
    }
  );
}

export async function handleResolveDeduplicationEntry(c: ContextWithAuth) {
  return withCampaignContext(
    c,
    "Failed to resolve deduplication entry",
    async ({ c: ctx, campaignId, entityDAO, getServices }) => {
      const entryId = ctx.req.param("entryId");
      const body = (await ctx.req.json()) as {
        status: "merged" | "rejected" | "confirmed_unique";
        userDecision?: string;
      };

      if (!body.status) {
        return ctx.json({ error: "status is required" }, 400);
      }

      const entry = await entityDAO.getDeduplicationEntryById(entryId);
      if (!entry || entry.campaignId !== campaignId) {
        return ctx.json({ error: "Deduplication entry not found" }, 404);
      }

      const { dedupeService } = getServices();
      await dedupeService.resolvePendingEntry(
        entryId,
        body.status,
        body.userDecision
      );

      return ctx.json({ status: "ok" });
    }
  );
}

/**
 * Test endpoint to extract entities from an R2 file (admin only)
 * Returns the same format as stageEntitiesFromResource would return
 * This allows testing entity extraction without actually adding files to campaigns
 */
export async function handleTestEntityExtractionFromR2(
  c: ContextWithAuth
): Promise<Response> {
  try {
    const userAuth = getUserAuth(c);

    // Require admin access
    if (!userAuth.isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const requestBody = (await c.req.json()) as {
      fileKey: string;
      campaignId?: string;
      sourceName?: string;
    };

    if (!requestBody.fileKey) {
      return c.json({ error: "fileKey is required" }, 400);
    }

    const openaiApiKey = c.env.OPENAI_API_KEY as string | undefined;
    if (!openaiApiKey) {
      return c.json(
        {
          error: "OpenAI API key is required for entity extraction",
        },
        400
      );
    }

    const campaignId = requestBody.campaignId || `test-${crypto.randomUUID()}`;
    const fileKey = requestBody.fileKey;
    const sourceName = requestBody.sourceName || fileKey;

    console.log(
      `[TestEntityExtraction] Testing entity extraction for file: ${fileKey}`
    );

    // Extract content from R2 file
    const r2Helper = new R2Helper(c.env);
    const provider = new DirectFileContentExtractionProvider(c.env, r2Helper);

    const resource = {
      id: fileKey,
      file_key: fileKey,
      file_name: sourceName,
    };

    const extractionResult = await provider.extractContent({ resource });

    if (!extractionResult.success || !extractionResult.content) {
      return c.json(
        {
          success: false,
          error:
            extractionResult.error || "Failed to extract content from file",
          entityCount: 0,
          stagedEntities: [],
        },
        400
      );
    }

    const fileContent = extractionResult.content;
    const isPDF = extractionResult.metadata?.isPDF || false;

    // Chunk content same way as staging service does
    const CHARS_PER_TOKEN = 4;
    const PROMPT_TOKENS_ESTIMATE = 3000;
    const MAX_RESPONSE_TOKENS = 16384;
    const TPM_LIMIT = 30000;
    const MAX_CONTENT_TOKENS =
      TPM_LIMIT - PROMPT_TOKENS_ESTIMATE - MAX_RESPONSE_TOKENS;
    const MAX_CHUNK_SIZE = Math.floor(MAX_CONTENT_TOKENS * CHARS_PER_TOKEN);

    const chunks =
      fileContent.length > MAX_CHUNK_SIZE
        ? isPDF
          ? chunkTextByPages(fileContent, MAX_CHUNK_SIZE)
          : chunkTextByCharacterCount(fileContent, MAX_CHUNK_SIZE)
        : [fileContent];

    console.log(
      `[TestEntityExtraction] Processing ${chunks.length} chunk(s) for file: ${fileKey}`
    );

    // Extract entities from each chunk
    const extractionService = new EntityExtractionService(openaiApiKey);
    const allExtractedEntities: Map<
      string,
      Awaited<ReturnType<typeof extractionService.extractEntities>>[0]
    > = new Map();

    const CHUNK_PROCESSING_DELAY_MS = chunks.length > 1 ? 2000 : 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i > 0 && CHUNK_PROCESSING_DELAY_MS > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_PROCESSING_DELAY_MS)
        );
      }

      const chunkEntities = await extractionService.extractEntities({
        content: chunk,
        sourceName,
        campaignId,
        sourceId: fileKey,
        sourceType: "file_upload",
        openaiApiKey,
        metadata: {
          fileKey,
          resourceId: fileKey,
          resourceName: sourceName,
          staged: true,
          shardStatus: "staging",
          chunkIndex: i,
          totalChunks: chunks.length,
        },
      });

      // Merge entities by ID (same logic as staging service)
      for (const entity of chunkEntities) {
        const existing = allExtractedEntities.get(entity.id);
        if (existing) {
          existing.content = {
            ...(typeof existing.content === "object" &&
            existing.content !== null
              ? existing.content
              : {}),
            ...(typeof entity.content === "object" && entity.content !== null
              ? entity.content
              : {}),
          };
          const existingTargetIds = new Set(
            existing.relations.map((r) => r.targetId)
          );
          for (const rel of entity.relations) {
            if (!existingTargetIds.has(rel.targetId)) {
              existing.relations.push(rel);
              existingTargetIds.add(rel.targetId);
            }
          }
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
      `[TestEntityExtraction] Extracted ${extractedEntities.length} entities from file: ${fileKey}`
    );

    // Format response same as EntityStagingResult
    const stagedEntities = extractedEntities.map((entity) => ({
      id: entity.id,
      entityType: entity.entityType,
      name: entity.name,
      content: entity.content,
      metadata: entity.metadata,
      relations: entity.relations.map((rel) => ({
        relationshipType: rel.relationshipType,
        targetId: rel.targetId,
        strength: rel.strength,
        metadata: rel.metadata,
      })),
    }));

    return c.json({
      success: true,
      entityCount: stagedEntities.length,
      stagedEntities,
      metadata: {
        fileKey,
        sourceName,
        chunkCount: chunks.length,
        isPDF,
      },
    });
  } catch (error) {
    console.error("[TestEntityExtraction] Error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        entityCount: 0,
        stagedEntities: [],
      },
      500
    );
  }
}
