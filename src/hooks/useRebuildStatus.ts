import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useBaseAsync } from "./useBaseAsync";
import { useAuthenticatedRequest } from "./useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { RebuildStatus } from "@/dao/rebuild-status-dao";

interface UseRebuildStatusOptions {
  campaignId: string;
  pollInterval?: number; // Polling interval in milliseconds (default: 5000)
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
 * Automatically polls for status updates when a rebuild is in progress.
 */
export function useRebuildStatus({
  campaignId,
  pollInterval = 5000,
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

  // Auto-polling when enabled and there's an active rebuild
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    refetch();

    // Listen for rebuild status change events from notifications
    const handleRebuildStatusChange = (event: CustomEvent) => {
      const detail = event.detail;
      // Only update if this event is for our campaign
      if (detail.campaignId === campaignId) {
        // Refetch to get the latest status
        refetch();
      }
    };

    window.addEventListener(
      "rebuild-status-changed",
      handleRebuildStatusChange as EventListener
    );

    // Set up polling ONLY if there's an active rebuild (as a fallback)
    // This ensures we eventually pick up status changes even if notifications fail
    const shouldPoll =
      activeRebuild &&
      (activeRebuild.status === "pending" ||
        activeRebuild.status === "in_progress");

    if (shouldPoll) {
      // Poll less frequently since we have notifications (30 seconds instead of 5)
      pollIntervalRef.current = setInterval(() => {
        refetch();
      }, 30000); // 30 seconds - just as a fallback
    } else {
      // Clear polling when rebuild completes
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      window.removeEventListener(
        "rebuild-status-changed",
        handleRebuildStatusChange as EventListener
      );
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, activeRebuild, campaignId, refetch]);

  return {
    activeRebuild,
    loading: fetchActiveRebuilds.loading,
    error: fetchActiveRebuilds.error,
    refetch,
  };
}
