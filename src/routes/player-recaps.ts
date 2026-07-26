/**
 * Player-facing recap email routes (issue #745).
 *
 * Every mutating route requires GM edit rights. The only unauthenticated route
 * is unsubscribe, which is authorised by an unguessable per-player token.
 */

import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { getEnvVar } from "@/lib/env-utils";
import { CampaignAccessDeniedError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import {
	flagPotentialSpoilers,
	toPlayerSafeRecap,
} from "@/lib/player-recap/player-safe-digest";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getUserAuth,
	requireCanEdit,
	requireParam,
} from "@/lib/route-utils";
import type { Env } from "@/routes/env";
import {
	PlayerRecapService,
	RecapAlreadySentError,
	RecapEmptyError,
	RecapNoRecipientsError,
	RecapNotEditableError,
	RecapNotEnabledError,
} from "@/services/session-digest/player-recap-service";

const DEFAULT_RECAP_FROM = "LoreSmith <recaps@loresmith.ai>";

async function buildService(
	c: ContextWithAuth | Context<{ Bindings: Env }>
): Promise<PlayerRecapService> {
	const env = c.env as Env;
	const daoFactory = getDAOFactory(env);
	const resendApiKey =
		(await getEnvVar(env, "RESEND_API_KEY", false)) || undefined;
	const fromAddress =
		(await getEnvVar(env, "RECAP_EMAIL_FROM", false)) ||
		(await getEnvVar(env, "VERIFICATION_EMAIL_FROM", false)) ||
		DEFAULT_RECAP_FROM;

	return new PlayerRecapService({
		db: env.DB as NonNullable<Env["DB"]>,
		dao: daoFactory.playerRecapDAO,
		appOrigin: new URL(c.req.url).origin,
		resendApiKey,
		fromAddress,
	});
}

/**
 * Map service errors to HTTP status codes.
 *
 * Kept in one place so every recap route reports the same failure the same way.
 */
function toErrorResponse(c: ContextWithAuth, error: unknown) {
	if (error instanceof CampaignAccessDeniedError) {
		return c.json({ error: "Access denied" }, 403);
	}
	if (error instanceof RecapNotEnabledError) {
		return c.json({ error: error.message, code: "recaps_disabled" }, 409);
	}
	if (error instanceof RecapAlreadySentError) {
		return c.json({ error: error.message, code: "already_sent" }, 409);
	}
	if (error instanceof RecapNotEditableError) {
		return c.json({ error: error.message, code: "not_editable" }, 409);
	}
	if (error instanceof RecapEmptyError) {
		return c.json({ error: error.message, code: "empty_recap" }, 422);
	}
	if (error instanceof RecapNoRecipientsError) {
		return c.json({ error: error.message, code: "no_recipients" }, 422);
	}
	if (error instanceof Error && /not found/i.test(error.message)) {
		return c.json({ error: error.message }, 404);
	}
	getRequestLogger(c).error("Player recap route error", error);
	return c.json(
		{
			error: "Player recap request failed",
			message: error instanceof Error ? error.message : "Unknown error",
		},
		500
	);
}

/** Guard shared by every GM-only recap route. */
async function requireGmOnCampaign(
	c: ContextWithAuth
): Promise<string | Response> {
	const auth = getUserAuth(c);
	const campaignId = requireParam(c, "campaignId");
	if (campaignId instanceof Response) return campaignId;

	const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
	if (!hasAccess) {
		return c.json({ error: "Campaign not found" }, 404);
	}
	await requireCanEdit(c, campaignId);
	return campaignId;
}

// --- Settings ---------------------------------------------------------------

export async function handleGetRecapSettings(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;

		const service = await buildService(c);
		const settings = await service.getSettings(campaignId);
		return c.json({ settings });
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

export async function handleUpdateRecapSettings(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;

		const body = (await c.req.json()) as { enabled?: unknown };
		if (typeof body.enabled !== "boolean") {
			return c.json({ error: "enabled must be a boolean" }, 400);
		}

		const service = await buildService(c);
		const settings = await service.setSettings(campaignId, body.enabled);
		return c.json({ settings });
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

// --- Recipients -------------------------------------------------------------

export async function handleGetRecapRecipients(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;

		const service = await buildService(c);
		const recipients = await service.getRecipients(campaignId);
		return c.json({
			recipients,
			eligibleCount: recipients.filter((r) => r.eligible).length,
		});
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

// --- Drafts -----------------------------------------------------------------

export async function handleListPlayerRecaps(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;

		const service = await buildService(c);
		return c.json({ recaps: await service.listRecaps(campaignId) });
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

/**
 * Generate (or regenerate) the draft recap for a digest.
 *
 * Returns the draft alongside the player-safe extract it came from and any
 * advisory spoiler flags, so the review UI can show the GM what was included
 * and where to look hardest.
 */
export async function handleGeneratePlayerRecap(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;
		const digestId = requireParam(c, "digestId");
		if (digestId instanceof Response) return digestId;

		const daoFactory = getDAOFactory(c.env);
		const digest =
			await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
		if (!digest || digest.campaignId !== campaignId) {
			return c.json({ error: "Session digest not found" }, 404);
		}

		const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		let nextSessionDate: string | null | undefined;
		try {
			const body = (await c.req.json()) as { nextSessionDate?: string | null };
			nextSessionDate = body?.nextSessionDate;
		} catch {
			// Body is optional.
		}

		const service = await buildService(c);
		const result = await service.generateDraft({
			campaignId,
			campaignName: campaign.name,
			digest,
			createdBy: getUserAuth(c).username,
			nextSessionDate,
		});

		return c.json(result, 201);
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

export async function handleGetPlayerRecap(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;
		const recapId = requireParam(c, "recapId");
		if (recapId instanceof Response) return recapId;

		const service = await buildService(c);
		const recap = await service.getRecap(recapId);
		if (!recap || recap.campaignId !== campaignId) {
			return c.json({ error: "Recap not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const digest = await daoFactory.sessionDigestDAO.getSessionDigestById(
			recap.digestId
		);
		const safeRecap = digest ? toPlayerSafeRecap(digest.digestData) : null;

		return c.json({
			recap,
			safeRecap,
			spoilerFlags: safeRecap ? flagPotentialSpoilers(safeRecap) : [],
			deliveries: await daoFactory.playerRecapDAO.listDeliveries(recapId),
		});
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

/** Apply the GM's edits to a draft. */
export async function handleUpdatePlayerRecap(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;
		const recapId = requireParam(c, "recapId");
		if (recapId instanceof Response) return recapId;

		const service = await buildService(c);
		const existing = await service.getRecap(recapId);
		if (!existing || existing.campaignId !== campaignId) {
			return c.json({ error: "Recap not found" }, 404);
		}

		const body = (await c.req.json()) as {
			subject?: unknown;
			bodyMarkdown?: unknown;
			nextSessionDate?: unknown;
		};

		const input: {
			subject?: string;
			bodyMarkdown?: string;
			nextSessionDate?: string | null;
		} = {};

		if (body.subject !== undefined) {
			if (
				typeof body.subject !== "string" ||
				body.subject.trim().length === 0
			) {
				return c.json({ error: "subject must be a non-empty string" }, 400);
			}
			input.subject = body.subject.trim();
		}
		if (body.bodyMarkdown !== undefined) {
			if (
				typeof body.bodyMarkdown !== "string" ||
				body.bodyMarkdown.trim().length === 0
			) {
				return c.json(
					{ error: "bodyMarkdown must be a non-empty string" },
					400
				);
			}
			input.bodyMarkdown = body.bodyMarkdown;
		}
		if (body.nextSessionDate !== undefined) {
			if (
				body.nextSessionDate !== null &&
				typeof body.nextSessionDate !== "string"
			) {
				return c.json(
					{ error: "nextSessionDate must be a string or null" },
					400
				);
			}
			input.nextSessionDate = body.nextSessionDate as string | null;
		}

		if (Object.keys(input).length === 0) {
			return c.json({ error: "No fields to update" }, 400);
		}

		return c.json({ recap: await service.updateDraft(recapId, input) });
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

/** Send a reviewed draft. This is the only route that mails players. */
export async function handleSendPlayerRecap(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;
		const recapId = requireParam(c, "recapId");
		if (recapId instanceof Response) return recapId;

		const service = await buildService(c);
		const existing = await service.getRecap(recapId);
		if (!existing || existing.campaignId !== campaignId) {
			return c.json({ error: "Recap not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const auth = getUserAuth(c);
		const gm = await daoFactory.authUserDAO.getUserByUsername(auth.username);

		const result = await service.send({
			campaignId,
			campaignName: campaign.name,
			recapId,
			sentBy: auth.username,
			replyTo: gm?.email_verified_at ? (gm.email ?? undefined) : undefined,
		});

		return c.json(result);
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

/** Return a fully failed send to draft so the GM can review and retry. */
export async function handleRetryPlayerRecap(c: ContextWithAuth) {
	try {
		const campaignId = await requireGmOnCampaign(c);
		if (campaignId instanceof Response) return campaignId;
		const recapId = requireParam(c, "recapId");
		if (recapId instanceof Response) return recapId;

		const service = await buildService(c);
		const existing = await service.getRecap(recapId);
		if (!existing || existing.campaignId !== campaignId) {
			return c.json({ error: "Recap not found" }, 404);
		}

		return c.json({ recap: await service.retryFailed(recapId) });
	} catch (error) {
		return toErrorResponse(c, error);
	}
}

// --- Unsubscribe (public) ---------------------------------------------------

function unsubscribePage(message: string, detail: string): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LoreSmith recaps</title>
</head>
<body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:64px auto;padding:32px;background:#fff;border-radius:12px;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${message}</h1>
    <p style="margin:0;color:#6b7280;line-height:1.6;">${detail}</p>
  </div>
</body>
</html>`;
}

/**
 * One-click unsubscribe.
 *
 * Authorised by the token alone so it works straight from an email client with
 * no LoreSmith session. Registered for both GET (the visible link) and POST
 * (the `List-Unsubscribe-Post` one-click flow mail providers use).
 */
export async function handleRecapUnsubscribe(c: Context<{ Bindings: Env }>) {
	const token = c.req.param("token");
	if (!token) {
		return c.html(
			unsubscribePage(
				"Link not recognised",
				"This unsubscribe link is missing its token."
			),
			400
		);
	}

	try {
		const service = await buildService(c);
		const result = await service.unsubscribe(token);
		if (!result) {
			return c.html(
				unsubscribePage(
					"Link not recognised",
					"This unsubscribe link is no longer valid. If you keep receiving recaps, reply to the email and ask your GM to remove you."
				),
				404
			);
		}

		return c.html(
			unsubscribePage(
				"You're unsubscribed",
				"You won't receive any more session recaps for this campaign. Your GM can still reach you directly."
			)
		);
	} catch (error) {
		getRequestLogger(c as unknown as ContextWithAuth).error(
			"Recap unsubscribe failed",
			error
		);
		return c.html(
			unsubscribePage(
				"Something went wrong",
				"We couldn't process that just now. Please try the link again in a moment."
			),
			500
		);
	}
}
