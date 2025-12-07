import { useState, useEffect, useRef } from "react";
import { API_CONFIG } from "@/app-constants";
import { AuthService } from "@/services/core/auth-service";
import type {
  AggregatedMetrics,
  TimeSeriesDataPoint,
  MetricType,
} from "@/types/telemetry";

export interface TelemetryMetricsOptions {
  metricType?: MetricType;
  campaignId?: string;
  fromDate?: string;
  toDate?: string;
  interval?: "hour" | "day" | "week";
  aggregation?: "aggregated" | "timeseries";
}

export interface DashboardSummary {
  summary: {
    queryLatency: AggregatedMetrics | null;
    rebuildDuration: AggregatedMetrics | null;
    dmSatisfaction: AggregatedMetrics | null;
    changelogGrowth: TimeSeriesDataPoint[];
  };
  lastUpdated: string;
}

export function useTelemetryMetrics(options: TelemetryMetricsOptions = {}) {
  const [metrics, setMetrics] = useState<AggregatedMetrics[] | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesDataPoint[] | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (fetchingRef.current) {
        return;
      }
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (options.metricType) params.append("metricType", options.metricType);
        if (options.campaignId) params.append("campaignId", options.campaignId);
        if (options.fromDate) params.append("fromDate", options.fromDate);
        if (options.toDate) params.append("toDate", options.toDate);
        if (options.interval) params.append("interval", options.interval);
        if (options.aggregation)
          params.append("aggregation", options.aggregation);

        const jwt = AuthService.getStoredJwt();
        if (!jwt) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.METRICS)}?${params}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error("Admin access required");
          }
          throw new Error(`Failed to fetch metrics: ${response.statusText}`);
        }

        const data = (await response.json()) as
          | {
              timeSeries?: TimeSeriesDataPoint[];
              metrics?: AggregatedMetrics[];
            }
          | { metrics?: AggregatedMetrics[] };

        if (
          options.aggregation === "timeseries" &&
          "timeSeries" in data &&
          data.timeSeries
        ) {
          setTimeSeries(data.timeSeries);
        } else if (data.metrics) {
          setMetrics(data.metrics);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchMetrics();
  }, [
    options.metricType,
    options.campaignId,
    options.fromDate,
    options.toDate,
    options.interval,
    options.aggregation,
  ]);

  return { metrics, timeSeries, loading, error };
}

export function useTelemetryDashboard() {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      if (fetchingRef.current) {
        return;
      }
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const jwt = AuthService.getStoredJwt();
        if (!jwt) {
          console.error("[useTelemetryDashboard] No JWT token found");
          throw new Error("Authentication required");
        }

        const url = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.DASHBOARD
        );
        console.log("[useTelemetryDashboard] Fetching dashboard from:", url);

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
          },
        });

        console.log(
          "[useTelemetryDashboard] Response status:",
          response.status,
          response.statusText
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[useTelemetryDashboard] Error response:", errorText);
          try {
            const errorData = JSON.parse(errorText);
            throw new Error(
              errorData.error ||
                `Failed to fetch dashboard: ${response.statusText}`
            );
          } catch {
            throw new Error(
              `Failed to fetch dashboard: ${response.statusText}`
            );
          }
        }

        const data = (await response.json()) as DashboardSummary;
        console.log("[useTelemetryDashboard] Dashboard data received:", data);
        setDashboard(data);
      } catch (err) {
        console.error("[useTelemetryDashboard] Error:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchDashboard();
  }, []);

  return { dashboard, loading, error };
}
