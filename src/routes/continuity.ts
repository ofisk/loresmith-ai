import { getDAOFactory } from "@/dao/dao-factory";
import { CampaignAccessDeniedError } from "@/lib/errors";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getUserAuth,
	requireCanEdit,
	requireParam,
} from "@/lib/route-utils";
import { ContinuityCheckerService } from "@/services/continuity/continuity-checker-service";
import type {
	ContinuityConfidence,
	ContinuityFindingStatus,
	ContinuityFindingType,
	ContinuityResolutionAction,
	ContinuityScanMode,
} from "@/types/continuity";
import { isContinuityFindingType, meetsConfidence } from "@/types/continuity";

const RESOLUTION_ACTIONS = new Set(["confirm", "dismiss", "correct"]);
const FINDING_STATUSES = new Set([
	"open",
	"confirmed",
	"dismissed",
	"corrected",
]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

/** Continuity is a GM tool end to end — players never see draft findings. */
async function requireGmAccess(
	c: ContextWithAuth,
	campaignId: string
): Promise<Response | null> {
	const auth = getUserAuth(c);
	const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
	if (!hasAccess) {
		return c.json({ error: "Campaign not found" }, 404);
	}
	await requireCanEdit(c, campaignId);
	return null;
}

function parseTypes(raw: unknown): ContinuityFindingType[] | undefined {
	const values = Array.isArray(raw)
		? raw
		: typeof raw === "string" && raw.length > 0
			? raw.split(",")
			: null;
	if (!values) return undefined;

	const types = values
		.map((value) => String(value).trim())
		.filter(isContinuityFindingType);
	return types.length > 0 ? types : undefined;
}

function handleError(c: ContextWithAuth, error: unknown, fallback: string) {
	if (error instanceof CampaignAccessDeniedError) {
		return c.json({ error: "Access denied" }, 403);
	}
	const message = error instanceof Error ? error.message : "Unknown error";
	if (/not found/i.test(message)) {
		return c.json({ error: message }, 404);
	}
	if (/requires|invalid|must/i.test(message)) {
		return c.json({ error: message }, 400);
	}
	return c.json({ error: fallback, message }, 500);
}

/** POST /campaigns/:campaignId/continuity/scan */
export async function handleScanCampaignContinuity(c: ContextWithAuth) {
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const denied = await requireGmAccess(c, campaignId);
		if (denied) return denied;

		if (!c.env.DB) {
			return c.json({ error: "Database not configured" }, 500);
		}

		const body = (await c.req.json().catch(() => ({}))) as {
			mode?: string;
			types?: unknown;
			maxCandidates?: number;
			minConfidence?: string;
		};

		const service = new ContinuityCheckerService({
			db: c.env.DB,
			env: c.env as unknown as Record<string, unknown>,
		});
		const result = await service.scan(campaignId, {
			mode: (body.mode === "full"
				? "full"
				: "incremental") as ContinuityScanMode,
			types: parseTypes(body.types),
			maxCandidates:
				typeof body.maxCandidates === "number" ? body.maxCandidates : undefined,
			minConfidence: CONFIDENCE_LEVELS.has(String(body.minConfidence))
				? (body.minConfidence as ContinuityConfidence)
				: undefined,
		});

		return c.json({ scan: result });
	} catch (error) {
		return handleError(c, error, "Failed to scan campaign continuity");
	}
}

/** GET /campaigns/:campaignId/continuity/findings */
export async function handleGetContinuityFindings(c: ContextWithAuth) {
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const denied = await requireGmAccess(c, campaignId);
		if (denied) return denied;

		const statusParam = c.req.query("status");
		const status = FINDING_STATUSES.has(String(statusParam))
			? (statusParam as ContinuityFindingStatus)
			: "open";
		const limitParam = Number.parseInt(c.req.query("limit") ?? "", 10);
		const minConfidenceParam = c.req.query("minConfidence");
		// Default to high only: the report is trusted precisely because it is quiet.
		const minConfidence: ContinuityConfidence = CONFIDENCE_LEVELS.has(
			String(minConfidenceParam)
		)
			? (minConfidenceParam as ContinuityConfidence)
			: "high";

		const daoFactory = getDAOFactory(c.env);
		const findings =
			await daoFactory.continuityFindingDAO.listFindingsForCampaign(
				campaignId,
				{
					status,
					types: parseTypes(c.req.query("types")),
					limit: Number.isFinite(limitParam) ? limitParam : 50,
				}
			);
		const visible = findings.filter((finding) =>
			meetsConfidence(finding.confidence, minConfidence)
		);

		return c.json({
			findings: visible,
			total: findings.length,
			status,
			minConfidence,
			openCount:
				await daoFactory.continuityFindingDAO.countOpenFindings(campaignId),
		});
	} catch (error) {
		return handleError(c, error, "Failed to list continuity findings");
	}
}

/** POST /campaigns/:campaignId/continuity/findings/:findingId/resolve */
export async function handleResolveContinuityFinding(c: ContextWithAuth) {
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const findingId = requireParam(c, "findingId");
		if (findingId instanceof Response) return findingId;

		const auth = getUserAuth(c);
		const denied = await requireGmAccess(c, campaignId);
		if (denied) return denied;

		if (!c.env.DB) {
			return c.json({ error: "Database not configured" }, 500);
		}

		const body = (await c.req.json()) as {
			action?: string;
			note?: string;
			correctedEntityId?: string;
			correctedStatus?: string;
			campaignSessionId?: number;
		};

		if (!body.action || !RESOLUTION_ACTIONS.has(body.action)) {
			return c.json(
				{ error: "action must be one of: confirm, dismiss, correct" },
				400
			);
		}

		const service = new ContinuityCheckerService({
			db: c.env.DB,
			env: c.env as unknown as Record<string, unknown>,
		});
		const result = await service.resolveFinding(campaignId, findingId, {
			action: body.action as ContinuityResolutionAction,
			note: body.note ?? null,
			resolvedBy: auth.username,
			correction: {
				entityId: body.correctedEntityId ?? null,
				status: body.correctedStatus ?? null,
				campaignSessionId: body.campaignSessionId ?? null,
			},
		});

		return c.json({
			finding: result.finding,
			changelogEntryId: result.changelogEntryId,
		});
	} catch (error) {
		return handleError(c, error, "Failed to resolve continuity finding");
	}
}
