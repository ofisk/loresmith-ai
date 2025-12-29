import React, { useState, useEffect } from "react";
import type { StagedShardGroup } from "../../types/shard";
import { ShardManagementUI } from "./ShardManagementUI";

interface UnifiedShardManagerProps {
  shards: StagedShardGroup[];
  isLoading: boolean;
  onShardsProcessed: (shardIds: string[]) => void;
  getJwt: () => string | null;
  onRefresh?: () => void;
}

export const UnifiedShardManager: React.FC<UnifiedShardManagerProps> = ({
  shards,
  isLoading,
  onShardsProcessed: _onShardsProcessed,
  getJwt: _getJwt,
  onRefresh,
}) => {
  // Group shards by campaign for better organization
  const shardsByCampaign = React.useMemo(() => {
    const groups: Record<
      string,
      { campaignName: string; campaignId: string; shards: StagedShardGroup[] }
    > = {};

    shards.forEach((shard) => {
      const campaignId = (shard as any).campaignId || "unknown";
      const campaignName = (shard as any).campaignName || "Unknown Campaign";

      if (!groups[campaignId]) {
        groups[campaignId] = { campaignName, campaignId, shards: [] };
      }
      groups[campaignId].shards.push(shard);
    });

    return groups;
  }, [shards]);

  const campaignEntries = Object.entries(shardsByCampaign);

  // Track active campaign tab
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  // Set initial active campaign when data loads
  useEffect(() => {
    if (campaignEntries.length > 0 && !activeCampaignId) {
      setActiveCampaignId(campaignEntries[0][0]);
    }
  }, [campaignEntries, activeCampaignId]);

  // Reset active campaign if it no longer exists
  useEffect(() => {
    if (activeCampaignId && !shardsByCampaign[activeCampaignId]) {
      const firstCampaign = campaignEntries[0];
      setActiveCampaignId(firstCampaign ? firstCampaign[0] : null);
    }
  }, [activeCampaignId, shardsByCampaign, campaignEntries]);

  const totalShards = shards.reduce(
    (total, group) => total + (group.shards?.length || 0),
    0
  );

  if (isLoading) {
    return (
      <div className="space-y-4 border border-gray-700 rounded-lg p-4 bg-gray-800">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (totalShards === 0) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-800">
        <div className="flex items-center justify-center p-8">
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg
                className="mx-auto h-12 w-12 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label="Document icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              No pending shards
            </h3>
            <p className="text-sm text-gray-400">
              All your knowledge fragments have been processed. New shards will
              appear here as they're generated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Get active campaign data
  const activeCampaignData = activeCampaignId
    ? shardsByCampaign[activeCampaignId]
    : null;

  return (
    <div className="space-y-4 pt-4 pl-4">
      {/* Campaign Tabs */}
      {campaignEntries.length > 1 && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4 overflow-x-auto">
            {campaignEntries.map(([campaignId, campaignData]) => {
              const shardCount = campaignData.shards.reduce(
                (total, group) => total + (group.shards?.length || 0),
                0
              );
              return (
                <button
                  key={campaignId}
                  type="button"
                  onClick={() => setActiveCampaignId(campaignId)}
                  className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeCampaignId === campaignId
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  {campaignData.campaignName} ({shardCount})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Campaign Shards */}
      {activeCampaignData && (
        <div className="space-y-3">
          <ShardManagementUI
            campaignId={activeCampaignData.campaignId}
            campaignName={activeCampaignData.campaignName}
            shards={activeCampaignData.shards}
            action="show_staged"
            onShardsUpdated={onRefresh ? async () => onRefresh() : undefined}
          />
        </div>
      )}
    </div>
  );
};
