import { useEffect, useRef, useState } from "react";
import { API_CONFIG } from "@/app-constants";
import { AuthService } from "@/services/core/auth-service";
import type {
	CostAttributionResponse,
	TelemetryAlertsResponse,
} from "@/types/cost-attribution";

async function fetchAdminJson<T>(url: string): Promise<T> {
	const jwt = AuthService.getStoredJwt();
	if (!jwt) {
		throw new Error("Authentication required");
	}

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${jwt}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		if (response.status === 403) {
			throw new Error("Admin access required");
		}
		// Parse, then throw — throwing inside the try would be caught by its own
		// catch, silently discarding the server's message.
		const errorText = await response.text();
		let message = response.statusText;
		try {
			const errorData = JSON.parse(errorText) as { error?: string };
			if (errorData.error) {
				message = errorData.error;
			}
		} catch {
			// Non-JSON body (HTML error page, proxy response): keep the status text.
		}
		throw new Error(message);
	}

	return (await response.json()) as T;
}

/** Spend attribution for the given window (issue #738). */
export function useCostAttribution(fromDate: string, toDate: string) {
	const [attribution, setAttribution] =
		useState<CostAttributionResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchingRef = useRef(false);

	useEffect(() => {
		const run = async () => {
			if (fetchingRef.current) return;
			fetchingRef.current = true;
			setLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({ fromDate, toDate });
				setAttribution(
					await fetchAdminJson<CostAttributionResponse>(
						`${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.COST_ATTRIBUTION)}?${params}`
					)
				);
			} catch (err) {
				setError(err instanceof Error ? err : new Error("Unknown error"));
			} finally {
				setLoading(false);
				fetchingRef.current = false;
			}
		};
		run();
	}, [fromDate, toDate]);

	return { attribution, loading, error };
}

/** Active cost-anomaly alerts. Always the trailing hour, so no window argument. */
export function useTelemetryAlerts() {
	const [alerts, setAlerts] = useState<TelemetryAlertsResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchingRef = useRef(false);

	useEffect(() => {
		const run = async () => {
			if (fetchingRef.current) return;
			fetchingRef.current = true;
			setLoading(true);
			setError(null);
			try {
				setAlerts(
					await fetchAdminJson<TelemetryAlertsResponse>(
						API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.ADMIN.TELEMETRY.ALERTS)
					)
				);
			} catch (err) {
				setError(err instanceof Error ? err : new Error("Unknown error"));
			} finally {
				setLoading(false);
				fetchingRef.current = false;
			}
		};
		run();
	}, []);

	return { alerts, loading, error };
}
