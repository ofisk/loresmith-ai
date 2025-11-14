import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_CONFIG } from "@/shared-config";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";

export function useShardRenderGate(
  getJwt: () => string | null,
  campaignIds: string[]
) {
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize the unique campaign IDs to prevent unnecessary re-renders
  const uniqueCampaignIds = useMemo(
    () => Array.from(new Set(campaignIds)).filter(Boolean) as string[],
    [campaignIds] // Use the array directly
  );

  // Debounced fetch function
  const fetchCampaignPresence = useCallback(
    async (cid: string, jwt: string) => {
      setIsLoading((prev) => {
        if (prev[cid]) return prev; // Prevent duplicate requests
        return { ...prev, [cid]: true };
      });

      try {
        const { response, jwtExpired } = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(cid)
          ),
          { jwt }
        );

        if (!jwtExpired && response.ok) {
          const json = (await response.json()) as { shards?: any[] };
          const has = Array.isArray(json?.shards) && json.shards.length > 0;
          setPresence((prev) => ({ ...prev, [cid]: has }));
        } else {
          setPresence((prev) => ({ ...prev, [cid]: false }));
        }
      } catch {
        setPresence((prev) => ({ ...prev, [cid]: false }));
      } finally {
        setIsLoading((prev) => ({ ...prev, [cid]: false }));
      }
    },
    [] // Remove isLoading dependency to prevent callback recreation
  );

  useEffect(() => {
    const jwt = getJwt();
    if (!jwt || uniqueCampaignIds.length === 0) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the requests by 500ms
    timeoutRef.current = setTimeout(() => {
      uniqueCampaignIds.forEach((cid) => {
        // Only fetch if we don't already have a result and aren't currently loading
        if (presence[cid] === undefined && !isLoading[cid]) {
          fetchCampaignPresence(cid, jwt);
        }
      });
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [uniqueCampaignIds, getJwt, fetchCampaignPresence, presence, isLoading]);

  const shouldRender = useMemo(
    () => (cid?: string) => (cid ? presence[cid] === true : false),
    [presence]
  );

  return { shouldRender, presence };
}
