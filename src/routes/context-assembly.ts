import { CampaignAccessDeniedError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getContextAssemblyService,
	getUserAuth,
	requireCanSeeSpoilers,
	requireParam,
} from "@/lib/route-utils";
import type { ContextAssemblyOptions } from "@/types/context-assembly";

export async function handleAssembleContext(c: ContextWithAuth) {
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
			options?: ContextAssemblyOptions;
		};

		if (!body.query || typeof body.query !== "string") {
			return c.json({ error: "query is required and must be a string" }, 400);
		}
		const service = await getContextAssemblyService(c);
		const options: ContextAssemblyOptions = body.options || {};

		const context = await service.assembleContext(
			body.query,
			campaignId,
			options
		);

		return c.json({
			context,
			cached: context.metadata.cached,
			performance: {
				graphRAGQueryTime: context.metadata.graphRAGQueryTime,
				changelogOverlayTime: context.metadata.changelogOverlayTime,
				planningContextTime: context.metadata.planningContextTime,
				totalAssemblyTime: context.metadata.totalAssemblyTime,
			},
		});
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			getRequestLogger(c).debug("[handleAssembleContext] Access denied", {
				error,
			});
			return c.json({ error: "Access denied" }, 403);
		}
		getRequestLogger(c).error(
			"[handleAssembleContext] Failed to assemble context",
			error
		);
		return c.json(
			{ error: "Failed to assemble context" },
			error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
		);
	}
}
