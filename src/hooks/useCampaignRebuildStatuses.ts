import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RebuildStatus } from "@/dao/rebuild-status-dao";
import { API_CONFIG } from "@/shared-config";
import { useAuthenticatedRequest } from "./useAuthenticatedRequest";

interface UseCampaignRebuildStatusesOptions {
	campaignIds: string[];
	pollInterval?: number; // Polling interval in milliseconds (default: 5000)
	enabled?: boolean; // Whether to automatically poll (default: true)
}

interface UseCampaignRebuildStatusesReturn {
	rebuildStatuses: Map<string, RebuildStatus | null>; // campaignId -> activeRebuild
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

/**
 * Hook for fetching active rebuild statuses for multiple campaigns.
 * Automatically polls for status updates when rebuilds are in progress.
 * This is more efficient than using multiple useRebuildStatus hooks.
 */
export function useCampaignRebuildStatuses({
	campaignIds,
	pollInterval = 5000,
	enabled = true,
}: UseCampaignRebuildStatusesOptions): UseCampaignRebuildStatusesReturn {
	const [rebuildStatuses, setRebuildStatuses] = useState<
		Map<string, RebuildStatus | null>
	>(new Map());
	const { makeRequestWithData } = useAuthenticatedRequest();
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const fetchAllRebuildStatuses = useCallback(async () => {
		if (campaignIds.length === 0) {
			setRebuildStatuses(new Map());
			return;
		}

		try {
			// Fetch all rebuild statuses in parallel
			const statusPromises = campaignIds.map(async (campaignId) => {
				try {
					const data = await makeRequestWithData<{
						rebuilds: RebuildStatus[];
					}>(
						API_CONFIG.buildUrl(
							API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_REBUILD.ACTIVE(campaignId)
						)
					);
					const rebuilds = data.rebuilds || [];
					// Get the most recent active rebuild (pending or in_progress)
					const active = rebuilds.find(
						(rebuild) =>
							rebuild.status === "pending" || rebuild.status === "in_progress"
					);
					return { campaignId, activeRebuild: active || null };
				} catch (_error) {
					return { campaignId, activeRebuild: null };
				}
			});

			const results = await Promise.all(statusPromises);
			const newStatusMap = new Map<string, RebuildStatus | null>();
			results.forEach(({ campaignId, activeRebuild }) => {
				newStatusMap.set(campaignId, activeRebuild);
			});
			setRebuildStatuses(newStatusMap);
		} catch (_error) {
			// Set all to null on error
			const errorMap = new Map<string, RebuildStatus | null>();
			for (const id of campaignIds) {
				errorMap.set(id, null);
			}
			setRebuildStatuses(errorMap);
		}
	}, [campaignIds, makeRequestWithData]);

	const hasActiveRebuilds = useMemo(
		() =>
			Array.from(rebuildStatuses.values()).some(
				(rebuild) =>
					rebuild &&
					(rebuild.status === "pending" || rebuild.status === "in_progress")
			),
		[rebuildStatuses]
	);

	const campaignIdsKey = useMemo(() => campaignIds.join("\0"), [campaignIds]);

	// Initial / list-change fetch only — never tie this to `rebuildStatuses` or every
	// poll creates a new Map and retriggers an immediate fetch storm.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `campaignIdsKey` encodes the full id set (length alone misses swaps); `fetchAllRebuildStatuses` already depends on `campaignIds`.
	useEffect(() => {
		if (!enabled || campaignIds.length === 0) {
			return;
		}
		void fetchAllRebuildStatuses();
	}, [enabled, campaignIdsKey, fetchAllRebuildStatuses]);

	// Interval keyed off a boolean summary so Map identity does not restart the loop.
	useEffect(() => {
		if (!enabled || campaignIds.length === 0) {
			return;
		}

		if (hasActiveRebuilds) {
			pollIntervalRef.current = setInterval(() => {
				void fetchAllRebuildStatuses();
			}, pollInterval);
		} else if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}

		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}
		};
	}, [
		enabled,
		campaignIds.length,
		hasActiveRebuilds,
		pollInterval,
		fetchAllRebuildStatuses,
	]);

	return {
		rebuildStatuses,
		loading: false, // We don't track loading state for batch operations
		error: null, // Errors are handled per-campaign
		refetch: fetchAllRebuildStatuses,
	};
}
