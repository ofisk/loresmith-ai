import { generateId } from "ai";
import { getDAOFactory } from "@/dao/dao-factory";
import { CampaignAccessDeniedError } from "@/lib/errors";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getUserAuth,
	requireCanEdit,
	requireCanSeeSpoilers,
	requireParam,
	verifyCampaignAccess,
} from "@/lib/route-utils";
import { RunsheetAssemblyService } from "@/services/campaign/runsheet-assembly-service";
import { RunsheetHtmlService } from "@/services/campaign/runsheet-html-service";
import type { RunsheetWithData, UpdateRunsheetInput } from "@/types/runsheet";
import { validateRunsheetData } from "@/types/runsheet";

/**
 * Session runsheets (issue #742).
 *
 * Every handler here gates on `requireCanSeeSpoilers` or `requireCanEdit`, both
 * of which exclude the player roles. A runsheet is the GM's secrets in one
 * document, so it must never become reachable through the player-facing share
 * flow (`src/routes/campaign-share.ts`) — the player-safe equivalent is handouts.
 */

function defaultRunsheetTitle(sessionNumber: number): string {
	return `Session ${sessionNumber} runsheet`;
}

/**
 * Load a runsheet and confirm it belongs to the campaign in the path.
 *
 * Answering 404 (not 403) for a cross-campaign id avoids confirming that the
 * runsheet exists at all to someone probing ids from a campaign they can read.
 */
async function loadRunsheetForCampaign(
	c: ContextWithAuth,
	campaignId: string,
	runsheetId: string
): Promise<RunsheetWithData | Response> {
	const daoFactory = getDAOFactory(c.env);
	const runsheet = await daoFactory.runsheetDAO.getRunsheetById(runsheetId);

	if (!runsheet || runsheet.campaignId !== campaignId) {
		return c.json({ error: "Runsheet not found" }, 404);
	}

	return runsheet;
}

function handleError(
	c: ContextWithAuth,
	error: unknown,
	fallbackMessage: string
): Response {
	if (error instanceof CampaignAccessDeniedError) {
		return c.json({ error: "Access denied" }, 403);
	}
	return c.json(
		{ error: fallbackMessage },
		error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
	);
}

/** Generate a new runsheet snapshot for a session. */
export async function handleGenerateRunsheet(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanEdit(c, campaignId);

		const body = (await c.req.json().catch(() => ({}))) as {
			sessionNumber?: number;
			title?: string;
		};

		const daoFactory = getDAOFactory(c.env);
		const sessionNumber =
			typeof body.sessionNumber === "number" && body.sessionNumber >= 1
				? body.sessionNumber
				: await daoFactory.sessionDigestDAO.getNextSessionNumber(campaignId);

		const runsheetData = await RunsheetAssemblyService.assemble(c.env, {
			campaignId,
			sessionNumber,
		});

		const title = body.title?.trim() || defaultRunsheetTitle(sessionNumber);
		const runsheetId = generateId();

		await daoFactory.runsheetDAO.createRunsheet(runsheetId, {
			campaignId,
			sessionNumber,
			title,
			runsheetData,
		});

		const created = await daoFactory.runsheetDAO.getRunsheetById(runsheetId);
		if (!created) {
			return c.json({ error: "Failed to retrieve created runsheet" }, 500);
		}

		return c.json({ runsheet: created }, 201);
	} catch (error) {
		return handleError(c, error, "Failed to generate runsheet");
	}
}

/** List runsheet snapshots for a campaign (summaries only). */
export async function handleListRunsheets(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const sessionNumberParam = c.req.query("sessionNumber");
		const parsedSessionNumber = sessionNumberParam
			? Number(sessionNumberParam)
			: undefined;

		const daoFactory = getDAOFactory(c.env);
		const runsheets = await daoFactory.runsheetDAO.listRunsheetsByCampaign(
			campaignId,
			{
				sessionNumber: Number.isInteger(parsedSessionNumber)
					? parsedSessionNumber
					: undefined,
			}
		);

		const nextSessionNumber =
			await daoFactory.sessionDigestDAO.getNextSessionNumber(campaignId);

		return c.json({ runsheets, nextSessionNumber });
	} catch (error) {
		return handleError(c, error, "Failed to list runsheets");
	}
}

/** Get a single runsheet snapshot, including its full body. */
export async function handleGetRunsheet(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const runsheetId = requireParam(c, "runsheetId");
		if (runsheetId instanceof Response) return runsheetId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const runsheet = await loadRunsheetForCampaign(c, campaignId, runsheetId);
		if (runsheet instanceof Response) return runsheet;

		return c.json({ runsheet });
	} catch (error) {
		return handleError(c, error, "Failed to get runsheet");
	}
}

/**
 * Update a runsheet's title or body.
 *
 * This is how hand-editing is persisted. It never re-assembles: a snapshot the
 * GM has edited must not be silently overwritten by fresher campaign data.
 */
export async function handleUpdateRunsheet(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const runsheetId = requireParam(c, "runsheetId");
		if (runsheetId instanceof Response) return runsheetId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanEdit(c, campaignId);

		const existing = await loadRunsheetForCampaign(c, campaignId, runsheetId);
		if (existing instanceof Response) return existing;

		const body = (await c.req.json()) as {
			title?: string;
			runsheetData?: unknown;
		};

		const updates: UpdateRunsheetInput = {};

		if (body.title !== undefined) {
			const trimmed = body.title.trim();
			if (!trimmed) {
				return c.json({ error: "Title cannot be empty" }, 400);
			}
			updates.title = trimmed;
		}

		if (body.runsheetData !== undefined) {
			if (!validateRunsheetData(body.runsheetData)) {
				return c.json({ error: "Invalid runsheetData structure" }, 400);
			}
			updates.runsheetData = body.runsheetData;
		}

		if (Object.keys(updates).length === 0) {
			return c.json({ error: "No fields to update" }, 400);
		}

		const daoFactory = getDAOFactory(c.env);
		await daoFactory.runsheetDAO.updateRunsheet(runsheetId, updates);

		const updated = await daoFactory.runsheetDAO.getRunsheetById(runsheetId);
		if (!updated) {
			return c.json({ error: "Failed to retrieve updated runsheet" }, 500);
		}

		return c.json({ runsheet: updated });
	} catch (error) {
		return handleError(c, error, "Failed to update runsheet");
	}
}

/** Delete a runsheet snapshot. */
export async function handleDeleteRunsheet(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const runsheetId = requireParam(c, "runsheetId");
		if (runsheetId instanceof Response) return runsheetId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanEdit(c, campaignId);

		const existing = await loadRunsheetForCampaign(c, campaignId, runsheetId);
		if (existing instanceof Response) return existing;

		const daoFactory = getDAOFactory(c.env);
		await daoFactory.runsheetDAO.deleteRunsheet(runsheetId);

		return c.json({ success: true });
	} catch (error) {
		return handleError(c, error, "Failed to delete runsheet");
	}
}

/**
 * Export a runsheet as a standalone, print-friendly HTML document.
 *
 * The response carries no auth in its URL, so the caller must already hold a
 * bearer token: the client fetches this and opens it as a blob rather than
 * navigating to it, which means no spoiler-bearing link ever exists to leak.
 */
export async function handleExportRunsheetHtml(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const runsheetId = requireParam(c, "runsheetId");
		if (runsheetId instanceof Response) return runsheetId;

		const campaign = await verifyCampaignAccess(c, campaignId, auth.username);
		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const runsheet = await loadRunsheetForCampaign(c, campaignId, runsheetId);
		if (runsheet instanceof Response) return runsheet;

		const html = RunsheetHtmlService.render(runsheet, {
			campaignName: campaign.name,
		});

		return c.body(html, 200, {
			"Content-Type": "text/html; charset=utf-8",
			"X-Content-Type-Options": "nosniff",
			// GM-only content: never let a proxy or the browser retain it.
			"Cache-Control": "no-store, private",
			"X-Robots-Tag": "noindex, nofollow",
		});
	} catch (error) {
		return handleError(c, error, "Failed to export runsheet");
	}
}
