import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import type { WorldStateChangelogPayload } from "@/types/world-state";
import { HistoricalContextService } from "@/services/rag/historical-context-service";
import type { HistoricalQueryInput } from "@/types/changelog-archive";

import {
  type ContextWithAuth,
  getUserAuth,
  ensureCampaignAccess,
} from "@/lib/route-utils";

interface IncomingChangelogPayload extends Partial<
  Omit<
    WorldStateChangelogPayload,
    | "entity_updates"
    | "relationship_updates"
    | "new_entities"
    | "campaign_session_id"
  >
> {
  campaign_session_id?: number | null;
  entity_updates?: WorldStateChangelogPayload["entity_updates"];
  relationship_updates?: WorldStateChangelogPayload["relationship_updates"];
  new_entities?: WorldStateChangelogPayload["new_entities"];
}

function getService(c: ContextWithAuth): WorldStateChangelogService {
  if (!c.env.DB) {
    throw new Error("Database not configured");
  }
  return new WorldStateChangelogService({ db: c.env.DB });
}

function getHistoricalService(c: ContextWithAuth): HistoricalContextService {
  if (!c.env.DB || !c.env.R2) {
    throw new Error("Database and R2 not configured");
  }
  return new HistoricalContextService({
    db: c.env.DB,
    r2: c.env.R2 as any,
    vectorize: c.env.VECTORIZE,
    openaiApiKey: c.env.OPENAI_API_KEY as string | undefined,
    env: c.env,
  });
}

function normalizePayload(
  body: IncomingChangelogPayload
): WorldStateChangelogPayload {
  const campaign_session_id =
    typeof body.campaign_session_id === "number" ||
    body.campaign_session_id === null
      ? body.campaign_session_id
      : null;

  return {
    campaign_session_id: campaign_session_id,
    timestamp: body.timestamp ?? new Date().toISOString(),
    entity_updates: Array.isArray(body.entity_updates)
      ? body.entity_updates
      : [],
    relationship_updates: Array.isArray(body.relationship_updates)
      ? body.relationship_updates
      : [],
    new_entities: Array.isArray(body.new_entities) ? body.new_entities : [],
  };
}

export async function handleCreateWorldStateChangelog(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as IncomingChangelogPayload;
    const payload = normalizePayload(body);
    const service = getService(c);
    const entry = await service.recordChangelog(campaignId, payload);
    return c.json({ entry }, 201);
  } catch (error) {
    console.error("[WorldState] Failed to record changelog:", error);
    return c.json(
      { error: "Failed to record world state changelog" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}

export async function handleListWorldStateChangelog(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const service = getService(c);
    const campaign_session_id = c.req.query("campaign_session_id");
    const entries = await service.listChangelogs(campaignId, {
      campaignSessionId: campaign_session_id
        ? Number(campaign_session_id)
        : undefined,
      fromTimestamp: c.req.query("from"),
      toTimestamp: c.req.query("to"),
      appliedToGraph:
        typeof c.req.query("applied") === "string"
          ? c.req.query("applied") === "true"
          : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    });

    return c.json({ entries });
  } catch (error) {
    console.error("[WorldState] Failed to list changelog entries:", error);
    return c.json({ error: "Failed to list world state changelog" }, 500);
  }
}

export async function handleGetWorldStateOverlay(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const service = getService(c);
    const upTo = c.req.query("timestamp");
    const entries = await service.listChangelogs(campaignId, {
      toTimestamp: upTo || undefined,
    });

    return c.json({
      overlayTimestamp: upTo ?? new Date().toISOString(),
      changelog: entries,
    });
  } catch (error) {
    console.error("[WorldState] Failed to fetch overlay:", error);
    return c.json({ error: "Failed to fetch world state overlay" }, 500);
  }
}

export async function handleQueryHistoricalState(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as HistoricalQueryInput;

    if (!body.query || typeof body.query !== "string") {
      return c.json({ error: "query is required and must be a string" }, 400);
    }

    if (!body.sessionId && !body.timestamp) {
      return c.json(
        { error: "Either sessionId or timestamp must be provided" },
        400
      );
    }

    const service = getHistoricalService(c);
    const historicalContext = await service.queryHistoricalState(
      campaignId,
      body
    );

    return c.json({ historicalContext });
  } catch (error) {
    console.error("[WorldState] Failed to query historical state:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to query historical state",
      },
      500
    );
  }
}

export async function handleGetHistoricalOverlay(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const sessionId = c.req.query("sessionId");
    const timestamp = c.req.query("timestamp");

    if (!sessionId && !timestamp) {
      return c.json(
        { error: "Either sessionId or timestamp query parameter is required" },
        400
      );
    }

    const service = getHistoricalService(c);
    const overlay = await service.getHistoricalOverlay(
      campaignId,
      sessionId ? Number(sessionId) : undefined,
      timestamp ?? undefined
    );

    return c.json({
      overlay,
      sessionId: sessionId ? Number(sessionId) : null,
      timestamp: timestamp ?? null,
    });
  } catch (error) {
    console.error("[WorldState] Failed to fetch historical overlay:", error);
    return c.json({ error: "Failed to fetch historical overlay" }, 500);
  }
}
