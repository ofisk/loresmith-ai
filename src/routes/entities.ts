import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { EntityDAO } from "@/dao/entity-dao";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
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
      bundle = {
        embeddingService,
        extractionService,
        pipeline: new EntityExtractionPipeline(
          entityDAO,
          extractionService,
          embeddingService,
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
    async ({ c: ctx, campaignId, entityDAO }) => {
      const entityId = ctx.req.param("entityId");
      const entity = await entityDAO.getEntityById(entityId);
      if (!entity || entity.campaignId !== campaignId) {
        return ctx.json({ error: "Entity not found" }, 404);
      }
      const relationships = await entityDAO.getRelationshipsForEntity(entityId);
      return ctx.json({ relationships });
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
