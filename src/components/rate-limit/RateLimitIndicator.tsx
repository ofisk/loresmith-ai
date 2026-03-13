import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/loader/Loader";
import type { useLocalNotifications } from "@/hooks/useLocalNotifications";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

interface UsageData {
	tph: number;
	qph: number;
	tpd: number;
	qpd: number;
	tphLimit: number;
	qphLimit: number;
	tpdLimit: number;
	qpdLimit: number;
	nextResetAt: string | null;
	atLimit: boolean;
	limitType?: "hour" | "daily";
	isAdmin: boolean;
	monthlyUsage?: number;
	monthlyLimit?: number;
	creditsRemaining?: number;
}

interface RateLimitIndicatorProps {
	addLocalNotification: ReturnType<
		typeof useLocalNotifications
	>["addLocalNotification"];
	onShowUsageLimits: () => void;
}

const POLL_INTERVAL_MS = 30_000;
const NEAR_LIMIT_THRESHOLD = 0.8;
const NOTIFY_THRESHOLDS = [0.5, 0.8, 1] as const;

function formatResetTime(iso: string): string {
	try {
		const d = new Date(iso.replace(" ", "T"));
		return d.toLocaleString(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

export function RateLimitIndicator({
	addLocalNotification,
	onShowUsageLimits,
}: RateLimitIndicatorProps) {
	const [usage, setUsage] = useState<UsageData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const lastNotifiedShortWindowRef = useRef<number>(0);
	const lastNotifiedDailyRef = useRef<number>(0);

	const fetchUsage = useCallback(async () => {
		try {
			const jwt = getStoredJwt();
			if (!jwt) {
				setUsage(null);
				setLoading(false);
				return;
			}

			const { response, jwtExpired } = await authenticatedFetchWithExpiration(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.LLM_USAGE),
				{ jwt }
			);

			if (jwtExpired || !response.ok) {
				setUsage(null);
				setLoading(false);
				return;
			}

			const data = (await response.json()) as {
				success?: boolean;
				usage?: UsageData;
			};
			if (data.success && data.usage) {
				setUsage(data.usage);
				setError(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch usage");
			setUsage(null);
		} finally {
			setLoading(false);
		}
	}, []);

	// Poll every 30s
	useEffect(() => {
		fetchUsage();
		const id = setInterval(fetchUsage, POLL_INTERVAL_MS);
		return () => clearInterval(id);
	}, [fetchUsage]);

	// Threshold notifications with de-duplication (50%, 80%, 100%)
	useEffect(() => {
		if (!usage || usage.isAdmin) return;

		const nextReset = usage.nextResetAt
			? formatResetTime(usage.nextResetAt)
			: "soon";

		const shortWindowPct =
			usage.tphLimit > 0 && usage.qphLimit > 0
				? Math.max(usage.tph / usage.tphLimit, usage.qph / usage.qphLimit)
				: 0;
		const dailyPct =
			usage.tpdLimit > 0 && usage.qpdLimit > 0
				? Math.max(usage.tpd / usage.tpdLimit, usage.qpd / usage.qpdLimit)
				: 0;

		// Check short-window dimension (hourly tokens + per-minute queries)
		for (let i = NOTIFY_THRESHOLDS.length - 1; i >= 0; i--) {
			const thresh = NOTIFY_THRESHOLDS[i];
			if (
				shortWindowPct >= thresh &&
				lastNotifiedShortWindowRef.current < thresh * 100
			) {
				lastNotifiedShortWindowRef.current = thresh * 100;
				const pctLabel = thresh === 1 ? "100%" : `${thresh * 100}%`;
				addLocalNotification(
					"error",
					"Usage limit",
					`You've used ${pctLabel} of your rate limit (tokens/hour or queries/hour). Next reset: ${nextReset}.`
				);
				break;
			}
		}
		if (shortWindowPct < 0.5) lastNotifiedShortWindowRef.current = 0;

		// Check daily dimension
		for (let i = NOTIFY_THRESHOLDS.length - 1; i >= 0; i--) {
			const thresh = NOTIFY_THRESHOLDS[i];
			if (dailyPct >= thresh && lastNotifiedDailyRef.current < thresh * 100) {
				lastNotifiedDailyRef.current = thresh * 100;
				const pctLabel = thresh === 1 ? "100%" : `${thresh * 100}%`;
				addLocalNotification(
					"error",
					"Usage limit",
					`You've used ${pctLabel} of your daily rate limit. Next reset: ${nextReset}.`
				);
				break;
			}
		}
		if (dailyPct < 0.5) lastNotifiedDailyRef.current = 0;
	}, [usage, addLocalNotification]);

	if (loading || error || !usage) {
		if (loading) {
			return (
				<div className="flex items-center justify-center py-1.5 px-2">
					<Loader size={12} />
				</div>
			);
		}
		return null;
	}

	if (usage.isAdmin) return null;

	const shortWindowPct =
		usage.tphLimit > 0
			? Math.min(
					1,
					Math.max(usage.tph / usage.tphLimit, usage.qph / usage.qphLimit)
				)
			: 0;
	const dailyPct =
		usage.tpdLimit > 0
			? Math.min(
					1,
					Math.max(usage.tpd / usage.tpdLimit, usage.qpd / usage.qpdLimit)
				)
			: 0;
	const monthlyPct =
		usage.monthlyLimit !== undefined &&
		usage.monthlyLimit > 0 &&
		usage.monthlyUsage !== undefined
			? Math.min(1, usage.monthlyUsage / usage.monthlyLimit)
			: 0;
	const pct =
		usage.monthlyLimit !== undefined
			? monthlyPct
			: Math.max(shortWindowPct, dailyPct);
	const nearLimit = pct >= NEAR_LIMIT_THRESHOLD;

	return (
		<div className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-700">
			<div className="flex items-center gap-2">
				<span className="text-xs text-neutral-600 dark:text-neutral-400 shrink-0">
					AI
				</span>
				<div className="flex-1 min-w-0">
					<div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5">
						<div
							className={`h-1.5 rounded-full transition-all duration-300 ${
								usage.atLimit
									? "bg-red-500"
									: nearLimit
										? "bg-amber-500"
										: "bg-blue-600"
							}`}
							style={{ width: `${Math.min(pct * 100, 100)}%` }}
						/>
					</div>
				</div>
				<span className="text-xs text-neutral-500 shrink-0">
					{(pct * 100).toFixed(0)}%
				</span>
				<button
					type="button"
					onClick={onShowUsageLimits}
					className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
				>
					Limits
				</button>
			</div>
		</div>
	);
}
