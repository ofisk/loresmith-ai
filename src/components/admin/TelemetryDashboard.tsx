import { useMemo } from "react";
import {
  useTelemetryDashboard,
  useTelemetryMetrics,
} from "@/hooks/useTelemetryMetrics";

export function TelemetryDashboard() {
  const {
    dashboard,
    loading: dashboardLoading,
    error: dashboardError,
  } = useTelemetryDashboard();

  const queryLatencyOptions = useMemo(
    () => ({
      metricType: "query_latency" as const,
      aggregation: "aggregated" as const,
      fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    []
  );

  const {
    metrics: queryLatencyMetrics,
    loading: latencyLoading,
    error: latencyError,
  } = useTelemetryMetrics(queryLatencyOptions);

  if (dashboardLoading || latencyLoading) {
    return (
      <div className="p-8">
        <div className="text-lg font-semibold mb-4">Telemetry Dashboard</div>
        <div>Loading metrics...</div>
      </div>
    );
  }

  if (dashboardError || latencyError) {
    const errorMessage =
      dashboardError?.message || latencyError?.message || "Unknown error";
    return (
      <div className="p-8">
        <div className="text-lg font-semibold mb-4">Telemetry Dashboard</div>
        <div className="text-red-600">
          Error loading dashboard: {errorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="text-2xl font-bold mb-6">
        GraphRAG Telemetry Dashboard
      </div>

      {/* Query Latency Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">
          Query Latency (Last 7 Days)
        </h2>
        {queryLatencyMetrics && queryLatencyMetrics.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                P50
              </div>
              <div className="text-2xl font-bold">
                {Math.round(queryLatencyMetrics[0].p50)}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                P95
              </div>
              <div className="text-2xl font-bold">
                {Math.round(queryLatencyMetrics[0].p95)}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                P99
              </div>
              <div className="text-2xl font-bold">
                {Math.round(queryLatencyMetrics[0].p99)}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Average
              </div>
              <div className="text-2xl font-bold">
                {Math.round(queryLatencyMetrics[0].avg)}ms
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">No query latency data available</div>
        )}
      </div>

      {/* Dashboard Summary */}
      {dashboard && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Dashboard Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            {dashboard.summary.queryLatency && (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Query Latency (P95)
                </div>
                <div className="text-xl font-bold">
                  {Math.round(dashboard.summary.queryLatency.p95)}ms
                </div>
              </div>
            )}
            {dashboard.summary.rebuildDuration && (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Rebuild Duration (Avg)
                </div>
                <div className="text-xl font-bold">
                  {Math.round(dashboard.summary.rebuildDuration.avg)}ms
                </div>
              </div>
            )}
            {dashboard.summary.dmSatisfaction && (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  DM Satisfaction (Avg)
                </div>
                <div className="text-xl font-bold">
                  {dashboard.summary.dmSatisfaction.avg.toFixed(2)} / 5.0
                </div>
              </div>
            )}
            {dashboard.summary.changelogGrowth.length > 0 && (
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Changelog Entries (Last 7 Days)
                </div>
                <div className="text-xl font-bold">
                  {dashboard.summary.changelogGrowth.reduce(
                    (sum, point) => sum + point.count,
                    0
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 text-sm text-gray-500">
            Last updated: {new Date(dashboard.lastUpdated).toLocaleString()}
          </div>
        </div>
      )}

      <div className="text-sm text-gray-500">
        Note: This dashboard requires admin access. Metrics are updated in
        real-time.
      </div>
    </div>
  );
}
