import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { EntityDAO } from "@/dao/entity-dao";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityExtractionPipeline } from "@/services/rag/entity-extraction-pipeline";
import { EntityDeduplicationService } from "@/services/rag/entity-deduplication-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";

type ContextWithAuth = Context<{
  Bindings: Env;
  Variables: {
    userAuth?: AuthPayload;
  };
}> & {
  userAuth?: AuthPayload;
};

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

function getUserAuth(c: ContextWithAuth): AuthPayload {
  const userAuth = (c as any).userAuth ?? c.get("userAuth");
  if (!userAuth) {
    throw new Error("User authentication missing from context");
  }
  return userAuth;
}

async function ensureCampaignAccess(
  c: ContextWithAuth,
  campaignId: string,
  username: string
): Promise<boolean> {
  const campaignDAO = getDAOFactory(c.env).campaignDAO;
  const ownership = await campaignDAO.getCampaignOwnership(
    campaignId,
    username
  );
  return ownership !== null;
}

function buildEntityServiceAccessor(
  c: ContextWithAuth,
  entityDAO: EntityDAO
): () => EntityServiceBundle {
  let bundle: EntityServiceBundle | null = null;
  return () => {
    if (!bundle) {
      const embeddingService = new EntityEmbeddingService(c.env.VECTORIZE);
      const extractionService = new EntityExtractionService(c.env);
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
          c.env
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

      return ctx.json({ entities });
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
      return ctx.json({ entity });
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
        return ctx.json({ relationships });
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
        return ctx.json({ neighbors });
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
