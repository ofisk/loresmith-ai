import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "@/shared-config";
import { authenticatedFetchWithExpiration } from "@/services/core/auth-service";
import type { StagedShardGroup } from "@/types/shard";

interface GlobalShardState {
  shards: StagedShardGroup[];
  isLoading: boolean;
  lastUpdated: number;
}

interface CampaignShardData {
  campaignId: string;
  campaignName: string;
  shards: StagedShardGroup[];
}

export function useGlobalShardManager(getJwt: () => string | null) {
  const [state, setState] = useState<GlobalShardState>({
    shards: [],
    isLoading: false,
    lastUpdated: 0,
  });

  // Fetch all staged shards from all campaigns
  const fetchAllStagedShards = useCallback(async () => {
    const jwt = getJwt();
    if (!jwt) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // First, get all campaigns
      const campaignsResponse = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.LIST),
        { jwt }
      );

      if (!campaignsResponse.response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      const campaignsData = (await campaignsResponse.response.json()) as {
        campaigns?: any[];
      };
      const campaigns = campaignsData.campaigns || [];

      // Fetch shards from each campaign
      const allShardPromises = campaigns.map(async (campaign: any) => {
        try {
          const shardsResponse = await authenticatedFetchWithExpiration(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_GRAPHRAG.STAGED_SHARDS(
                campaign.campaignId
              )
            ),
            { jwt }
          );

          if (shardsResponse.response.ok) {
            const shardsData = (await shardsResponse.response.json()) as {
              shards?: any[];
            };
            const shards = shardsData.shards || [];

            // Add campaign info to each shard group
            const enrichedShards = shards.map((shard: any) => ({
              ...shard,
              campaignId: campaign.campaignId,
              campaignName: campaign.name,
            }));

            return {
              campaignId: campaign.campaignId,
              campaignName: campaign.name,
              shards: enrichedShards,
            } as CampaignShardData;
          }
        } catch (error) {
          console.error(
            `Failed to fetch shards for campaign ${campaign.campaignId}:`,
            error
          );
        }
        return null;
      });

      const campaignShardResults = await Promise.all(allShardPromises);
      const validResults = campaignShardResults.filter(
        Boolean
      ) as CampaignShardData[];

      // Flatten all shards into a single array
      const allShards = validResults.flatMap((result) => result.shards);

      setState({
        shards: allShards,
        isLoading: false,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.error("Failed to fetch staged shards:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [getJwt]);

  // Add new shards from a specific campaign (called when new shards are generated)
  const addShardsFromCampaign = useCallback(
    (
      campaignId: string,
      campaignName: string,
      newShards: StagedShardGroup[]
    ) => {
      console.log("addShardsFromCampaign called:", {
        campaignId,
        campaignName,
        newShardsCount: newShards.length,
        newShards,
      });

      setState((prev) => {
        // Remove any existing shards from this campaign to avoid duplicates
        const filteredShards = prev.shards.filter(
          (shard) => (shard as any).campaignId !== campaignId
        );

        // Add campaign info to new shards
        const enrichedShards = newShards.map((shard) => ({
          ...shard,
          campaignId,
          campaignName,
        }));

        const newState = {
          ...prev,
          shards: [...filteredShards, ...enrichedShards],
          lastUpdated: Date.now(),
        };

        console.log("Global shard state updated:", {
          previousCount: prev.shards.length,
          newCount: newState.shards.length,
          newState,
        });

        return newState;
      });
    },
    []
  );

  // Remove shards after they've been processed (approved/rejected)
  const removeProcessedShards = useCallback((shardIds: string[]) => {
    setState((prev) => ({
      ...prev,
      shards: prev.shards
        .map((group) => ({
          ...group,
          shards: group.shards.filter((shard) => !shardIds.includes(shard.id)),
        }))
        .filter((group) => group.shards.length > 0), // Remove empty groups
      lastUpdated: Date.now(),
    }));
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchAllStagedShards();
  }, [fetchAllStagedShards]);

  return {
    shards: state.shards,
    isLoading: state.isLoading,
    lastUpdated: state.lastUpdated,
    fetchAllStagedShards,
    addShardsFromCampaign,
    removeProcessedShards,
  };
}
