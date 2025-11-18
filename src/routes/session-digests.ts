import type { Context } from "hono";
import { generateId } from "ai";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import type {
  CreateSessionDigestInput,
  SessionDigestData,
  UpdateSessionDigestInput,
} from "@/types/session-digest";
import { validateSessionDigestData } from "@/types/session-digest";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

function getUserAuth(c: ContextWithAuth): AuthPayload {
  const userAuth = (c as any).userAuth;
  if (!userAuth) {
    throw new UserAuthenticationMissingError();
  }
  return userAuth;
}

async function ensureCampaignAccess(
  c: ContextWithAuth,
  campaignId: string,
  username: string
): Promise<boolean> {
  const daoFactory = getDAOFactory(c.env);
  const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
    campaignId,
    username
  );
  return Boolean(campaign);
}

// Create a new session digest
export async function handleCreateSessionDigest(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as {
      sessionNumber: number;
      sessionDate?: string | null;
      digestData: SessionDigestData;
    };

    if (!body.sessionNumber || typeof body.sessionNumber !== "number") {
      return c.json(
        { error: "sessionNumber is required and must be a number" },
        400
      );
    }

    if (!body.digestData || !validateSessionDigestData(body.digestData)) {
      return c.json({ error: "Invalid digestData structure" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const existing =
      await daoFactory.sessionDigestDAO.getSessionDigestByCampaignAndSession(
        campaignId,
        body.sessionNumber
      );

    if (existing) {
      return c.json(
        {
          error:
            "Session digest already exists for this campaign and session number",
        },
        409
      );
    }

    const digestId = generateId();
    const input: CreateSessionDigestInput = {
      campaignId,
      sessionNumber: body.sessionNumber,
      sessionDate: body.sessionDate || null,
      digestData: body.digestData,
    };

    await daoFactory.sessionDigestDAO.createSessionDigest(digestId, input);

    const created =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
    if (!created) {
      return c.json({ error: "Failed to retrieve created digest" }, 500);
    }

    return c.json({ digest: created }, 201);
  } catch (error) {
    console.error("[SessionDigest] Failed to create digest:", error);
    return c.json(
      { error: "Failed to create session digest" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}

// Get a specific session digest
export async function handleGetSessionDigest(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const digestId = c.req.param("digestId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const digest =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);

    if (!digest) {
      return c.json({ error: "Session digest not found" }, 404);
    }

    if (digest.campaignId !== campaignId) {
      return c.json(
        { error: "Session digest does not belong to this campaign" },
        404
      );
    }

    return c.json({ digest });
  } catch (error) {
    console.error("[SessionDigest] Failed to get digest:", error);
    return c.json({ error: "Failed to get session digest" }, 500);
  }
}

// Get all session digests for a campaign
export async function handleGetSessionDigests(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const digests =
      await daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(campaignId);

    return c.json({ digests });
  } catch (error) {
    console.error("[SessionDigest] Failed to list digests:", error);
    return c.json({ error: "Failed to list session digests" }, 500);
  }
}

// Update a session digest
export async function handleUpdateSessionDigest(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const digestId = c.req.param("digestId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const existing =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);

    if (!existing) {
      return c.json({ error: "Session digest not found" }, 404);
    }

    if (existing.campaignId !== campaignId) {
      return c.json(
        { error: "Session digest does not belong to this campaign" },
        404
      );
    }

    const body = (await c.req.json()) as {
      sessionDate?: string | null;
      digestData?: SessionDigestData;
    };

    const input: UpdateSessionDigestInput = {};

    if (body.sessionDate !== undefined) {
      input.sessionDate = body.sessionDate;
    }

    if (body.digestData !== undefined) {
      if (!validateSessionDigestData(body.digestData)) {
        return c.json({ error: "Invalid digestData structure" }, 400);
      }
      input.digestData = body.digestData;
    }

    if (Object.keys(input).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    await daoFactory.sessionDigestDAO.updateSessionDigest(digestId, input);

    const updated =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
    if (!updated) {
      return c.json({ error: "Failed to retrieve updated digest" }, 500);
    }

    return c.json({ digest: updated });
  } catch (error) {
    console.error("[SessionDigest] Failed to update digest:", error);
    return c.json(
      { error: "Failed to update session digest" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}

// Delete a session digest
export async function handleDeleteSessionDigest(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const digestId = c.req.param("digestId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const existing =
      await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);

    if (!existing) {
      return c.json({ error: "Session digest not found" }, 404);
    }

    if (existing.campaignId !== campaignId) {
      return c.json(
        { error: "Session digest does not belong to this campaign" },
        404
      );
    }

    await daoFactory.sessionDigestDAO.deleteSessionDigest(digestId);

    return c.json({ success: true });
  } catch (error) {
    console.error("[SessionDigest] Failed to delete digest:", error);
    return c.json({ error: "Failed to delete session digest" }, 500);
  }
}
