import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RebuildStatus } from "@/dao/rebuild-status-dao";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { API_CONFIG } from "@/shared-config";
import { useAuthenticatedRequest } from "./useAuthenticatedRequest";
import { useBaseAsync } from "./useBaseAsync";

interface UseRebuildStatusOptions {
	campaignId?: string;
	enabled?: boolean; // Whether to automatically poll (default: true)
}

interface UseRebuildStatusReturn {
	activeRebuild: RebuildStatus | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

/**
 * Hook for fetching active rebuild status for a single campaign.
 * Uses event-based updates from notifications with fallback polling (30s) when rebuild is active.
 */
export function useRebuildStatus({
	campaignId,
	enabled = true,
}: UseRebuildStatusOptions): UseRebuildStatusReturn {
	const [activeRebuild, setActiveRebuild] = useState<RebuildStatus | null>(
		null
	);
	const { makeRequestWithData } = useAuthenticatedRequest();
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const fetchActiveRebuilds = useBaseAsync(
		useMemo(
			() => async () => {
				if (!campaignId) {
					return [];
				}
				const data = await makeRequestWithData<{ rebuilds: RebuildStatus[] }>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE(campaignId)
					)
				);
				return data.rebuilds || [];
			},
			[campaignId, makeRequestWithData]
		),
		useMemo(
			() => ({
				onSuccess: (rebuilds: RebuildStatus[]) => {
					// Get the most recent active rebuild (pending or in_progress)
					const active = rebuilds.find(
						(rebuild) =>
							rebuild.status === "pending" || rebuild.status === "in_progress"
					);
					setActiveRebuild(active || null);
				},
				onError: () => {
					setActiveRebuild(null);
				},
				errorMessage: "Failed to fetch rebuild status",
			}),
			[]
		)
	);

	const refetch = useCallback(async () => {
		await fetchActiveRebuilds.execute();
	}, [fetchActiveRebuilds.execute]);

	// Primitives only — `activeRebuild` is a new object every fetch; depending on it
	// caused an infinite refetch loop (effect → refetch → setState → effect).
	const shouldPollInterval =
		activeRebuild?.status === "pending" ||
		activeRebuild?.status === "in_progress";

	// Load once when the campaign (or enabled flag) changes — not on every rebuild payload.
	useEffect(() => {
		if (!enabled || !campaignId) {
			return;
		}
		void refetch();
	}, [enabled, campaignId, refetch]);

	// Notifications + slow polling; depends only on status string, not rebuild object identity.
	useEffect(() => {
		if (!enabled || !campaignId) {
			return;
		}

		const handleRebuildStatusChange = (event: CustomEvent) => {
			const detail = event.detail;
			if (detail.campaignId === campaignId) {
				void refetch();
			}
		};

		window.addEventListener(
			APP_EVENT_TYPE.REBUILD_STATUS_CHANGED,
			handleRebuildStatusChange as EventListener
		);

		if (shouldPollInterval) {
			pollIntervalRef.current = setInterval(() => {
				void refetch();
			}, 30000);
		} else if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}

		return () => {
			window.removeEventListener(
				APP_EVENT_TYPE.REBUILD_STATUS_CHANGED,
				handleRebuildStatusChange as EventListener
			);
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}
		};
	}, [enabled, campaignId, shouldPollInterval, refetch]);

	return {
		activeRebuild,
		loading: fetchActiveRebuilds.loading,
		error: fetchActiveRebuilds.error,
		refetch,
	};
}
