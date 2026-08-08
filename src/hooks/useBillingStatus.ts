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
	/** Recurring per-month allowance (free tier). */
	monthlyTokens?: number;
	/** One-time welcome grant on top of the monthly allowance (free tier). */
	trialTokens?: number;
	resourcesPerCampaignPerHour?: number;
}

export interface BillingStatus {
	tier: "free" | "basic" | "pro";
	isAdmin?: boolean;
	status: string;
	currentPeriodEnd: string | null;
	limits: BillingLimits;
	/** Tokens spent across both free-tier buckets. */
	monthlyUsage?: number;
	creditsRemaining?: number;
	/** Unused tokens in this month's allowance (free tier). */
	monthlyRemaining?: number;
	/** When the monthly allowance next refreshes (free tier). */
	nextResetAt?: string;
}

export function useBillingStatus(isAuthenticated: boolean) {
	const [data, setData] = useState<BillingStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isAuthenticated) {
			setLoading(false);
			return;
		}
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
	}, [isAuthenticated]);

	return { data, loading, error };
}
