import { useEffect, useMemo, useState } from "react";
import { API_CONFIG } from "../shared-config";
import { authenticatedFetchWithExpiration } from "../services/auth-service";

export function useShardRenderGate(
  getJwt: () => string | null,
  campaignIds: string[]
) {
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const jwt = getJwt();
    if (!jwt) return;
    const unique = Array.from(new Set(campaignIds)).filter(Boolean) as string[];
    unique.forEach((cid) => {
      if (presence[cid] !== undefined) return;
      (async () => {
        try {
          const { response, jwtExpired } =
            await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SHARDS(
                  cid
                )
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
        }
      })();
    });
  }, [getJwt, campaignIds]);

  const shouldRender = useMemo(
    () => (cid?: string) => (cid ? presence[cid] === true : false),
    [presence]
  );

  return { shouldRender, presence };
}
