import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import type {
  SatisfactionRating,
  ContextAccuracy,
  MetricType,
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
  return new TelemetryService(new TelemetryDAO(c.env.DB!));
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
    console.error("Error recording satisfaction rating:", error);
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
    console.error("Error recording context accuracy:", error);
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
    console.error("Error getting metrics:", error);
    if (error instanceof Error && error.message === "Admin access required") {
      return c.json({ error: "Admin access required" }, 403);
    }
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
    requireAdmin(c);

    const telemetryService = getTelemetryService(c);

    // Get recent metrics for dashboard overview
    const now = new Date();
    const last7Days = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Get key metrics for dashboard
    const [queryLatency, rebuildDuration, dmSatisfaction, changelogGrowth] =
      await Promise.all([
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
      ]);

    return c.json({
      summary: {
        queryLatency,
        rebuildDuration,
        dmSatisfaction,
        changelogGrowth,
      },
      lastUpdated: now.toISOString(),
    });
  } catch (error) {
    console.error("Error getting dashboard:", error);
    if (error instanceof Error && error.message === "Admin access required") {
      return c.json({ error: "Admin access required" }, 403);
    }
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

    // TODO: Implement alert service to get active alerts
    // For now, return empty array
    return c.json({ alerts: [] });
  } catch (error) {
    console.error("Error getting alerts:", error);
    if (error instanceof Error && error.message === "Admin access required") {
      return c.json({ error: "Admin access required" }, 403);
    }
    return c.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  }
}
