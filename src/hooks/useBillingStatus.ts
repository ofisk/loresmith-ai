import { useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";

export interface BillingLimits {
	maxCampaigns: number;
	maxFiles: number;
	storageBytes: number;
	tph: number;
	qph: number;
	tpd: number;
	qpd: number;
	monthlyTokens?: number;
	lifetimeTokens?: number;
	resourcesPerCampaignPerHour?: number;
}

export interface BillingStatus {
	tier: "free" | "basic" | "pro";
	isAdmin?: boolean;
	status: string;
	currentPeriodEnd: string | null;
	limits: BillingLimits;
	monthlyUsage?: number;
	creditsRemaining?: number;
}

export function useBillingStatus() {
	const [data, setData] = useState<BillingStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const jwt = localStorage.getItem(JWT_STORAGE_KEY);
		if (!jwt) {
			setLoading(false);
			return;
		}

		let cancelled = false;

		async function fetchStatus() {
			try {
				const res = await fetch(
					API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.STATUS),
					{
						headers: { Authorization: `Bearer ${jwt}` },
					}
				);
				if (cancelled) return;
				if (!res.ok) {
					if (res.status === 401) {
						setData(null);
						setLoading(false);
						return;
					}
					setError("Failed to load billing status");
					setLoading(false);
					return;
				}
				const json = (await res.json()) as BillingStatus;
				setData(json);
				setError(null);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Unknown error");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchStatus();
		return () => {
			cancelled = true;
		};
	}, []);

	return { data, loading, error };
}
