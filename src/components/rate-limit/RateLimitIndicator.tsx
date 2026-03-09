import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/loader/Loader";
import type { useLocalNotifications } from "@/hooks/useLocalNotifications";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

interface UsageData {
	tpm: number;
	qpm: number;
	tpd: number;
	qpd: number;
	tpmLimit: number;
	qpmLimit: number;
	tpdLimit: number;
	qpdLimit: number;
	nextResetAt: string | null;
	atLimit: boolean;
	limitType?: "minute" | "daily";
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

	const lastNotifiedMinuteRef = useRef<number>(0);
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
			console.error("[RateLimitIndicator] Failed to fetch usage:", err);
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

		const minutePct =
			usage.tpmLimit > 0 && usage.qpmLimit > 0
				? Math.max(usage.tpm / usage.tpmLimit, usage.qpm / usage.qpmLimit)
				: 0;
		const dailyPct =
			usage.tpdLimit > 0 && usage.qpdLimit > 0
				? Math.max(usage.tpd / usage.tpdLimit, usage.qpd / usage.qpdLimit)
				: 0;

		// Check minute dimension
		for (let i = NOTIFY_THRESHOLDS.length - 1; i >= 0; i--) {
			const thresh = NOTIFY_THRESHOLDS[i];
			if (minutePct >= thresh && lastNotifiedMinuteRef.current < thresh * 100) {
				lastNotifiedMinuteRef.current = thresh * 100;
				const pctLabel = thresh === 1 ? "100%" : `${thresh * 100}%`;
				addLocalNotification(
					"error",
					"Usage limit",
					`You've used ${pctLabel} of your per-minute rate limit. Next reset: ${nextReset}.`
				);
				break;
			}
		}
		if (minutePct < 0.5) lastNotifiedMinuteRef.current = 0;

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
				<div className="flex items-center justify-center p-4">
					<Loader size={16} />
				</div>
			);
		}
		return null;
	}

	if (usage.isAdmin) return null;

	const minutePct =
		usage.tpmLimit > 0
			? Math.min(
					1,
					Math.max(usage.tpm / usage.tpmLimit, usage.qpm / usage.qpmLimit)
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
			: Math.max(minutePct, dailyPct);
	const nearLimit = pct >= NEAR_LIMIT_THRESHOLD;
	const isMonthly = usage.monthlyLimit !== undefined;

	return (
		<div className="p-4 border-t border-gray-200 dark:border-gray-700">
			<div className="flex items-center justify-between text-sm mb-2">
				<span className="text-gray-600 dark:text-gray-400">AI usage</span>
				<button
					type="button"
					onClick={onShowUsageLimits}
					className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
				>
					View limits
				</button>
			</div>
			<div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
				<span>
					{isMonthly &&
					usage.monthlyUsage !== undefined &&
					usage.monthlyLimit !== undefined
						? `${usage.monthlyUsage.toLocaleString()} / ${usage.monthlyLimit.toLocaleString()} tokens this month`
						: `${usage.tpd.toLocaleString()} / ${usage.tpdLimit.toLocaleString()} tokens today`}
				</span>
				{nearLimit && usage.nextResetAt && (
					<span className="text-amber-600 dark:text-amber-400">
						Resets {formatResetTime(usage.nextResetAt)}
					</span>
				)}
			</div>
			<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
				<div
					className={`h-2 rounded-full transition-all duration-300 ${
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
	);
}
