import type { Context } from "hono";
import type { AdminAnalyticsQueryOptions } from "@/dao/admin-analytics-dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionQueueDAO } from "@/dao/entity-extraction-queue-dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import type { AdminTelemetryOverviewResponse } from "@/types/admin-analytics";
import type {
	ContextAccuracy,
	MetricType,
	SatisfactionRating,
	TelemetryTopError,
} from "@/types/telemetry";

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

function requireAdmin(c: ContextWithAuth): void {
	const userAuth = getUserAuth(c);
	if (!userAuth.isAdmin) {
		throw new Error("Admin access required");
	}
}

function getTelemetryService(c: ContextWithAuth): TelemetryService {
	if (!c.env.DB) {
		throw new Error("Database not configured");
	}
	return new TelemetryService(new TelemetryDAO(c.env.DB));
}

/**
 * POST /api/telemetry/ratings
 * Record DM satisfaction rating
 */
export async function handleRecordSatisfactionRating(c: ContextWithAuth) {
	try {
		getUserAuth(c); // Verify authentication
		const body = (await c.req.json()) as SatisfactionRating;

		if (!body.campaignId || !body.rating) {
			return c.json({ error: "campaignId and rating are required" }, 400);
		}

		if (body.rating < 1 || body.rating > 5) {
			return c.json({ error: "rating must be between 1 and 5" }, 400);
		}

		const telemetryService = getTelemetryService(c);
		await telemetryService.recordDmSatisfaction(body.rating, {
			campaignId: body.campaignId,
			queryId: body.queryId,
			feedback: body.feedback,
			contextType: body.contextType,
		});

		return c.json({ success: true });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleRecordSatisfaction] Failed to record satisfaction",
			error
		);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}

/**
 * POST /api/telemetry/context-accuracy
 * Record context accuracy measurement
 */
export async function handleRecordContextAccuracy(c: ContextWithAuth) {
	try {
		getUserAuth(c); // Verify authentication
		const body = (await c.req.json()) as ContextAccuracy;

		if (!body.campaignId || !body.queryId || body.accuracy === undefined) {
			return c.json(
				{ error: "campaignId, queryId, and accuracy are required" },
				400
			);
		}

		if (body.accuracy < 0 || body.accuracy > 1) {
			return c.json({ error: "accuracy must be between 0 and 1" }, 400);
		}

		const telemetryService = getTelemetryService(c);
		await telemetryService.recordContextAccuracy(body.accuracy, {
			campaignId: body.campaignId,
			queryId: body.queryId,
			notes: body.notes,
		});

		return c.json({ success: true });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleRecordContextAccuracy] Failed to record context accuracy",
			error
		);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}

/**
 * GET /api/admin/telemetry/metrics
 * Get aggregated metrics (admin only)
 */
export async function handleGetMetrics(c: ContextWithAuth) {
	try {
		requireAdmin(c);
	} catch (error) {
		if (error instanceof UserAuthenticationMissingError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		if (error instanceof Error && error.message === "Admin access required") {
			return c.json({ error: "Admin access required" }, 403);
		}
		throw error;
	}

	try {
		const metricType = c.req.query("metricType") as MetricType | undefined;
		const campaignId = c.req.query("campaignId") || undefined;
		const fromDate = c.req.query("fromDate") || undefined;
		const toDate = c.req.query("toDate") || undefined;
		const aggregation = c.req.query("aggregation") || "aggregated";

		const telemetryService = getTelemetryService(c);

		if (aggregation === "timeseries" && metricType) {
			const interval =
				(c.req.query("interval") as "hour" | "day" | "week") || "day";
			const timeSeries = await telemetryService.getTimeSeriesData(metricType, {
				campaignId,
				fromDate,
				toDate,
				interval,
			});
			return c.json({ timeSeries });
		}

		if (metricType) {
			const aggregated = await telemetryService.getAggregatedMetrics(
				metricType,
				{
					campaignId,
					fromDate,
					toDate,
				}
			);
			return c.json({ metrics: aggregated ? [aggregated] : [] });
		}

		// Return all metric types if no specific type requested
		const allMetrics: MetricType[] = [
			"file_processing_duration_ms",
			"query_latency",
			"rebuild_duration",
			"rebuild_frequency",
			"changelog_entry_count",
			"changelog_size_bytes",
			"entity_extraction_count",
			"entities_extracted",
			"relationship_extraction_count",
			"dm_satisfaction",
			"context_accuracy",
		];

		const results = await Promise.all(
			allMetrics.map((type) =>
				telemetryService.getAggregatedMetrics(type, {
					campaignId,
					fromDate,
					toDate,
				})
			)
		);

		return c.json({
			metrics: results.filter((m) => m !== null),
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Admin access required") {
			return c.json({ error: "Admin access required" }, 403);
		}
		getRequestLogger(c).error(
			"[handleGetMetrics] Failed to get metrics",
			error
		);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}

/**
 * GET /api/admin/telemetry/dashboard
 * Get dashboard summary (admin only)
 */
export async function handleGetDashboard(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;

		if (!userAuth) {
			return c.json({ error: "Authentication required" }, 401);
		}

		if (!userAuth.isAdmin) {
			return c.json({ error: "Admin access required" }, 403);
		}
	} catch (_error) {
		getRequestLogger(c).debug(
			"[handleGetDashboard] Authentication check failed",
			{ error: _error }
		);
		return c.json({ error: "Authentication required" }, 401);
	}

	try {
		const telemetryService = getTelemetryService(c);

		// Get recent metrics for dashboard overview
		const now = new Date();
		const last7Days = new Date(
			now.getTime() - 7 * 24 * 60 * 60 * 1000
		).toISOString();

		// Get key metrics for dashboard
		const daoFactory = getDAOFactory(c.env);
		const extractionQueueDao = new EntityExtractionQueueDAO(c.env.DB);

		const [
			queryLatency,
			rebuildDuration,
			dmSatisfaction,
			changelogGrowth,
			rebuildErrors,
			extractionErrors,
		] = await Promise.all([
			telemetryService.getAggregatedMetrics("query_latency", {
				fromDate: last7Days,
			}),
			telemetryService.getAggregatedMetrics("rebuild_duration", {
				fromDate: last7Days,
			}),
			telemetryService.getAggregatedMetrics("dm_satisfaction", {
				fromDate: last7Days,
			}),
			telemetryService.getTimeSeriesData("changelog_entry_count", {
				fromDate: last7Days,
				interval: "day",
			}),
			daoFactory.rebuildStatusDAO.getTopFailedErrorMessages({
				fromDate: last7Days,
				limit: 15,
			}),
			extractionQueueDao.getTopFailedErrorMessages({
				fromDate: last7Days,
				limit: 15,
			}),
		]);

		const topErrors: TelemetryTopError[] = [
			...rebuildErrors.map((row) => ({
				source: "graph_rebuild" as const,
				message: row.errorMessage,
				count: row.count,
			})),
			...extractionErrors.map((row) => ({
				source: "entity_extraction" as const,
				message: row.errorMessage,
				count: row.count,
			})),
		]
			.sort((a, b) => b.count - a.count)
			.slice(0, 20);

		return c.json({
			summary: {
				queryLatency,
				rebuildDuration,
				dmSatisfaction,
				changelogGrowth,
			},
			topErrors,
			lastUpdated: now.toISOString(),
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Admin access required") {
			return c.json({ error: "Admin access required" }, 403);
		}
		getRequestLogger(c).error(
			"[handleGetDashboard] Failed to get dashboard",
			error
		);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}

/**
 * GET /api/admin/telemetry/overview
 * Full admin analytics snapshot (admin only)
 */
export async function handleGetAdminTelemetryOverview(c: ContextWithAuth) {
	try {
		requireAdmin(c);
	} catch (error) {
		if (error instanceof UserAuthenticationMissingError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		if (error instanceof Error && error.message === "Admin access required") {
			return c.json({ error: "Admin access required" }, 403);
		}
		throw error;
	}

	if (!c.env.DB) {
		return c.json({ error: "Database not configured" }, 500);
	}

	const now = Date.now();
	const defaultFrom = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
	const fromDate = c.req.query("fromDate") || defaultFrom;
	const toDate = c.req.query("toDate") || new Date(now).toISOString();
	const topN = Math.min(
		50,
		Math.max(1, Number.parseInt(c.req.query("topN") || "10", 10) || 10)
	);
	const sampleLimit = Math.min(
		25,
		Math.max(1, Number.parseInt(c.req.query("sampleLimit") || "8", 10) || 8)
	);
	const entityExtractionStuckMinutes = Math.min(
		24 * 60,
		Math.max(
			5,
			Number.parseInt(c.req.query("stuckExtractionMins") || "60", 10) || 60
		)
	);
	const syncQueueStuckMinutes = Math.min(
		24 * 60,
		Math.max(5, Number.parseInt(c.req.query("stuckSyncMins") || "30", 10) || 30)
	);
	const rebuildStuckMinutes = Math.min(
		24 * 60,
		Math.max(
			10,
			Number.parseInt(c.req.query("stuckRebuildMins") || "120", 10) || 120
		)
	);
	const fileChunkStuckMinutes = Math.min(
		24 * 60,
		Math.max(
			5,
			Number.parseInt(c.req.query("stuckChunkMins") || "45", 10) || 45
		)
	);

	const opts: AdminAnalyticsQueryOptions = {
		fromDate,
		toDate,
		topN,
		sampleLimit,
		entityExtractionStuckBefore: new Date(
			now - entityExtractionStuckMinutes * 60 * 1000
		).toISOString(),
		syncQueueStuckBefore: new Date(
			now - syncQueueStuckMinutes * 60 * 1000
		).toISOString(),
		rebuildStuckBefore: new Date(
			now - rebuildStuckMinutes * 60 * 1000
		).toISOString(),
		fileChunkStuckBefore: new Date(
			now - fileChunkStuckMinutes * 60 * 1000
		).toISOString(),
		entityExtractionStuckMinutes,
		syncQueueStuckMinutes,
		rebuildStuckMinutes,
		fileChunkStuckMinutes,
	};

	try {
		const dao = getDAOFactory(c.env).adminAnalyticsDAO;
		const telemetry = new TelemetryService(new TelemetryDAO(c.env.DB));

		const [
			shards,
			stuck,
			rebuilds,
			digests,
			dedup,
			growth,
			library,
			usage,
			fileProcessingDurationMs,
			queryLatency,
			rebuildDuration,
			dmSatisfaction,
			contextAccuracy,
			changelogEntryCount,
		] = await Promise.all([
			dao.getShardAnalytics(fromDate, toDate, topN),
			dao.getStuckQueues(opts),
			dao.getRebuildHealth(fromDate, toDate),
			dao.getDigestFunnel(fromDate, toDate),
			dao.getDedupAnalytics(fromDate, toDate),
			dao.getGrowth(fromDate, toDate),
			dao.getLibraryHealth(),
			dao.getUsageAnalytics(fromDate, toDate, topN),
			telemetry.getAggregatedMetrics("file_processing_duration_ms", {
				fromDate,
				toDate,
			}),
			telemetry.getAggregatedMetrics("query_latency", { fromDate, toDate }),
			telemetry.getAggregatedMetrics("rebuild_duration", { fromDate, toDate }),
			telemetry.getAggregatedMetrics("dm_satisfaction", { fromDate, toDate }),
			telemetry.getAggregatedMetrics("context_accuracy", { fromDate, toDate }),
			telemetry.getAggregatedMetrics("changelog_entry_count", {
				fromDate,
				toDate,
			}),
		]);

		const body: AdminTelemetryOverviewResponse = {
			window: { from: fromDate, to: toDate },
			stuckThresholds: {
				entityExtractionMinutes: entityExtractionStuckMinutes,
				syncQueueMinutes: syncQueueStuckMinutes,
				rebuildMinutes: rebuildStuckMinutes,
				fileChunkMinutes: fileChunkStuckMinutes,
			},
			shards,
			queues: { stuck },
			rebuilds,
			digests,
			dedup,
			growth,
			library,
			usage,
			telemetry: {
				fileProcessingDurationMs,
				queryLatency,
				rebuildDuration,
				dmSatisfaction,
				contextAccuracy,
				changelogEntryCount,
			},
			lastUpdated: new Date(now).toISOString(),
		};

		return c.json(body);
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetAdminTelemetryOverview] Failed",
			error
		);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}

/**
 * GET /api/admin/telemetry/alerts
 * Get active alerts (admin only)
 */
export async function handleGetAlerts(c: ContextWithAuth) {
	try {
		requireAdmin(c);
	} catch (error) {
		if (error instanceof UserAuthenticationMissingError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		if (error instanceof Error && error.message === "Admin access required") {
			return c.json({ error: "Admin access required" }, 403);
		}
		throw error;
	}

	try {
		// TODO: Implement alert service to get active alerts
		// For now, return empty array
		return c.json({ alerts: [] });
	} catch (error) {
		getRequestLogger(c).error("[handleGetAlerts] Failed to get alerts", error);
		return c.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			500
		);
	}
}
