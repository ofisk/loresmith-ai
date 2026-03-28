import { useEffect, useRef, useState } from "react";
import { API_CONFIG } from "@/app-constants";
import { AuthService } from "@/services/core/auth-service";
import type { AdminTelemetryOverviewResponse } from "@/types/admin-analytics";
import type {
	AggregatedMetrics,
	MetricType,
	TelemetryTopError,
	TimeSeriesDataPoint,
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
		/** Avg/total JSON repair LLM passes per recorded extraction job (last 7 days window). */
		extractionJsonRepair: AggregatedMetrics | null;
		/** Counts of approved shards that were new vs updates (last 7 days). */
		shardApprovalNew: AggregatedMetrics | null;
		shardApprovalUpdate: AggregatedMetrics | null;
	};
	topErrors?: TelemetryTopError[];
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
					throw new Error("Authentication required");
				}

				const url = API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.DASHBOARD
				);

				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					const errorText = await response.text();
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
				setDashboard(data);
			} catch (err) {
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

export function useAdminTelemetryOverview(fromDate: string, toDate: string) {
	const [overview, setOverview] =
		useState<AdminTelemetryOverviewResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchingRef = useRef(false);

	useEffect(() => {
		const fetchOverview = async () => {
			if (fetchingRef.current) {
				return;
			}
			fetchingRef.current = true;
			setLoading(true);
			setError(null);

			try {
				const jwt = AuthService.getStoredJwt();
				if (!jwt) {
					throw new Error("Authentication required");
				}

				const params = new URLSearchParams({
					fromDate,
					toDate,
				});
				const url = `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.OVERVIEW)}?${params}`;

				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					const errorText = await response.text();
					try {
						const errorData = JSON.parse(errorText) as { error?: string };
						throw new Error(
							errorData.error ||
								`Failed to fetch overview: ${response.statusText}`
						);
					} catch {
						throw new Error(`Failed to fetch overview: ${response.statusText}`);
					}
				}

				const data = (await response.json()) as AdminTelemetryOverviewResponse;
				setOverview(data);
			} catch (err) {
				setError(err instanceof Error ? err : new Error("Unknown error"));
			} finally {
				setLoading(false);
				fetchingRef.current = false;
			}
		};

		fetchOverview();
	}, [fromDate, toDate]);

	return { overview, loading, error };
}
