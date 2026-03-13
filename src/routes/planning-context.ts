import { getDAOFactory } from "@/dao/dao-factory";
import { CampaignAccessDeniedError } from "@/lib/errors";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getPlanningContextService,
	getUserAuth,
	requireCanSeeSpoilers,
	requireParam,
} from "@/lib/route-utils";
import type { PlanningContextSearchOptions } from "@/services/rag/planning-context-service";

export async function handleSearchPlanningContext(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const body = (await c.req.json()) as {
			query: string;
			limit?: number;
			fromDate?: string;
			toDate?: string;
			sectionTypes?: string[];
			applyRecencyWeighting?: boolean;
			decayRate?: number;
		};

		if (!body.query || typeof body.query !== "string") {
			return c.json({ error: "query is required and must be a string" }, 400);
		}
		const service = await getPlanningContextService(c);
		const searchOptions: PlanningContextSearchOptions = {
			campaignId,
			query: body.query,
			limit: body.limit,
			fromDate: body.fromDate,
			toDate: body.toDate,
			sectionTypes: body.sectionTypes,
			applyRecencyWeighting:
				body.applyRecencyWeighting !== undefined
					? body.applyRecencyWeighting
					: true,
			decayRate: body.decayRate,
		};

		const results = await service.search(searchOptions);

		return c.json({ results });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json(
			{ error: "Failed to search planning context" },
			error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
		);
	}
}

export async function handleGetRecentPlanningContext(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const limit = c.req.query("limit")
			? Number(c.req.query("limit"))
			: undefined;

		const daoFactory = getDAOFactory(c.env);
		const digests = await daoFactory.sessionDigestDAO.getRecentSessionDigests(
			campaignId,
			limit || 10
		);

		return c.json({ digests });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json({ error: "Failed to get recent planning context" }, 500);
	}
}
