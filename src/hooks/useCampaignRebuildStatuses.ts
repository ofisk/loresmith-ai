import { useState, useCallback, useEffect, useRef } from "react";
import { useAuthenticatedRequest } from "./useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { RebuildStatus } from "@/dao/rebuild-status-dao";

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
        } catch (error) {
          console.error(
            `Failed to fetch rebuild status for campaign ${campaignId}:`,
            error
          );
          return { campaignId, activeRebuild: null };
        }
      });

      const results = await Promise.all(statusPromises);
      const newStatusMap = new Map<string, RebuildStatus | null>();
      results.forEach(({ campaignId, activeRebuild }) => {
        newStatusMap.set(campaignId, activeRebuild);
      });
      setRebuildStatuses(newStatusMap);
    } catch (error) {
      console.error("Failed to fetch rebuild statuses:", error);
      // Set all to null on error
      const errorMap = new Map<string, RebuildStatus | null>();
      for (const id of campaignIds) {
        errorMap.set(id, null);
      }
      setRebuildStatuses(errorMap);
    }
  }, [campaignIds, makeRequestWithData]);

  // Auto-polling when enabled and there are active rebuilds
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    fetchAllRebuildStatuses();

    // Check if any rebuilds are active
    const hasActiveRebuilds = Array.from(rebuildStatuses.values()).some(
      (rebuild) =>
        rebuild &&
        (rebuild.status === "pending" || rebuild.status === "in_progress")
    );

    if (hasActiveRebuilds) {
      pollIntervalRef.current = setInterval(() => {
        fetchAllRebuildStatuses();
      }, pollInterval);
    } else {
      // Clear polling when no active rebuilds
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, rebuildStatuses, pollInterval, fetchAllRebuildStatuses]);

  return {
    rebuildStatuses,
    loading: false, // We don't track loading state for batch operations
    error: null, // Errors are handled per-campaign
    refetch: fetchAllRebuildStatuses,
  };
}
