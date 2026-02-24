import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { requireCanEdit, getUserAuth } from "@/lib/route-utils";
import type { CampaignMemberRole } from "@/dao/campaign-share-link-dao";
import { nanoid } from "@/lib/nanoid";
import { DEFAULT_APP_ORIGIN } from "@/shared-config";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/** POST /campaigns/:campaignId/share-links - create share link (owner, editor_gm) */
export async function handleCreateShareLink(c: ContextWithAuth) {
  try {
    const userAuth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const body = (await c.req.json()) as {
      role: CampaignMemberRole;
      expiresAt?: string | null;
      maxUses?: number | null;
    };

    if (!body.role) {
      return c.json({ error: "role is required" }, 400);
    }

    await requireCanEdit(c, campaignId);

    const token = nanoid(24);
    const daoFactory = getDAOFactory(c.env);
    await daoFactory.campaignShareLinkDAO.createShareLink(
      token,
      campaignId,
      body.role,
      userAuth.username,
      body.expiresAt ? new Date(body.expiresAt) : null,
      body.maxUses ?? null
    );

    const baseUrl =
      (c.env as { APP_ORIGIN?: string }).APP_ORIGIN ?? DEFAULT_APP_ORIGIN;
    const url = `${baseUrl}/join?token=${token}`;

    return c.json(
      {
        token,
        url,
        expiresAt: body.expiresAt ?? null,
        maxUses: body.maxUses ?? null,
      },
      201
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "CampaignAccessDeniedError"
    ) {
      return c.json(
        {
          error:
            "You do not have permission to create share links for this campaign",
        },
        403
      );
    }
    console.error("Error creating share link:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/** GET /campaigns/:campaignId/share-links - list active links (owner, editor_gm) */
export async function handleListShareLinks(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    await requireCanEdit(c, campaignId);

    const daoFactory = getDAOFactory(c.env);
    const links =
      await daoFactory.campaignShareLinkDAO.listShareLinks(campaignId);

    return c.json({
      links: links.map((l) => ({
        token: l.token,
        role: l.role,
        createdBy: l.created_by,
        expiresAt: l.expires_at,
        maxUses: l.max_uses,
        useCount: l.use_count,
        createdAt: l.created_at,
      })),
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "CampaignAccessDeniedError"
    ) {
      return c.json(
        {
          error:
            "You do not have permission to list share links for this campaign",
        },
        403
      );
    }
    console.error("Error listing share links:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/** DELETE /campaigns/:campaignId/share-links/:token - revoke link */
export async function handleRevokeShareLink(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const token = c.req.param("token");
    await requireCanEdit(c, campaignId);

    const daoFactory = getDAOFactory(c.env);
    const link = await daoFactory.campaignShareLinkDAO.getShareLink(token);
    if (!link || link.campaign_id !== campaignId) {
      return c.json({ error: "Share link not found" }, 404);
    }

    await daoFactory.campaignShareLinkDAO.revokeShareLink(token);
    return c.json({ success: true });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "CampaignAccessDeniedError"
    ) {
      return c.json(
        {
          error:
            "You do not have permission to revoke share links for this campaign",
        },
        403
      );
    }
    console.error("Error revoking share link:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/** GET /campaigns/join?token=... - redeem share link (can be unauthenticated; redirects to login if needed) */
export async function handleCampaignJoin(c: ContextWithAuth) {
  try {
    const token = c.req.query("token");
    if (!token) {
      return c.json({ error: "token is required" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const link = await daoFactory.campaignShareLinkDAO.getShareLink(token);
    if (!link) {
      return c.json({ error: "Invalid or expired link" }, 404);
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return c.json({ error: "Link has expired" }, 410);
    }

    // Check max uses
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return c.json({ error: "Link has reached maximum uses" }, 410);
    }

    // If not authenticated, return 401 with redirect hint
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      const campaign = await daoFactory.campaignDAO.getCampaignById(
        link.campaign_id
      );
      return c.json(
        {
          error: "Authentication required",
          redirectToLogin: true,
          campaignId: link.campaign_id,
          campaignName: campaign?.name,
          role: link.role,
        },
        401
      );
    }

    // Redeem the link
    const result = await daoFactory.campaignShareLinkDAO.redeemShareLink(
      token,
      userAuth.username
    );
    if (!result) {
      return c.json({ error: "Invalid or expired link" }, 404);
    }

    // Add user as campaign member
    await daoFactory.campaignDAO.addCampaignMember(
      result.campaignId,
      userAuth.username,
      result.role,
      link.created_by
    );

    const campaign = await daoFactory.campaignDAO.getCampaignById(
      result.campaignId
    );

    return c.json({
      success: true,
      campaignId: result.campaignId,
      campaignName: campaign?.name,
      role: result.role,
      url: `/campaigns/${result.campaignId}`,
    });
  } catch (error) {
    console.error("Error redeeming campaign join link:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
