import React, { useState, useCallback } from "react";
import { authenticatedFetchWithExpiration } from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";
import type { StagedShardGroup } from "../../types/shard";
import { ShardActionBar, ShardGroup, ShardHeader } from "./shard";

interface UnifiedShardManagerProps {
  shards: StagedShardGroup[];
  isLoading: boolean;
  onShardsProcessed: (shardIds: string[]) => void;
  getJwt: () => string | null;
}

export const UnifiedShardManager: React.FC<UnifiedShardManagerProps> = ({
  shards,
  isLoading,
  onShardsProcessed,
  getJwt,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedShards, setSelectedShards] = useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = useState("");
  const [processedShards, setProcessedShards] = useState<Set<string>>(
    new Set()
  );

  // Group shards by campaign for better organization
  const shardsByCampaign = React.useMemo(() => {
    const groups: Record<
      string,
      { campaignName: string; shards: StagedShardGroup[] }
    > = {};

    shards.forEach((shard) => {
      const campaignId = (shard as any).campaignId || "unknown";
      const campaignName = (shard as any).campaignName || "Unknown Campaign";

      if (!groups[campaignId]) {
        groups[campaignId] = { campaignName, shards: [] };
      }
      groups[campaignId].shards.push(shard);
    });

    return groups;
  }, [shards]);

  const totalShards = shards.reduce(
    (total, group) => total + (group.shards?.length || 0),
    0
  );

  // Extract campaign and resource names for the header
  const campaignInfo = React.useMemo(() => {
    if (shards.length === 0) return { campaignName: null, resourceName: null };

    const firstShard = shards[0];
    const campaignName = (firstShard as any).campaignName || "Unknown Campaign";

    // Get resource name from the first shard's sourceRef
    const resourceName =
      firstShard.sourceRef?.meta?.fileName || "Unknown Resource";

    return { campaignName, resourceName };
  }, [shards]);

  const handleShardSelection = useCallback(
    (shardId: string, checked: boolean) => {
      setSelectedShards((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(shardId);
        } else {
          newSet.delete(shardId);
        }
        return newSet;
      });
    },
    []
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const allShardIds = new Set<string>();
        shards.forEach((group) => {
          group.shards.forEach((shard) => {
            allShardIds.add(shard.id);
          });
        });
        setSelectedShards(allShardIds);
      } else {
        setSelectedShards(new Set());
      }
    },
    [shards]
  );

  const handleApproveAll = useCallback(async () => {
    if (selectedShards.size === 0) return;

    const jwt = getJwt();
    if (!jwt) return;

    setProcessing("approving");

    try {
      // Group selected shards by campaign
      const shardsByCampaign: Record<
        string,
        { stagingKeys: string[]; shardIds: string[] }
      > = {};

      selectedShards.forEach((shardId) => {
        // Find the shard and its campaign
        for (const group of shards) {
          const shard = group.shards.find((s) => s.id === shardId);
          if (shard) {
            const campaignId = (group as any).campaignId;
            if (!shardsByCampaign[campaignId]) {
              shardsByCampaign[campaignId] = { stagingKeys: [], shardIds: [] };
            }
            shardsByCampaign[campaignId].shardIds.push(shardId);
            shardsByCampaign[campaignId].stagingKeys.push(group.key);
          }
        }
      });

      // Approve shards for each campaign
      const approvalPromises = Object.entries(shardsByCampaign).map(
        async ([campaignId, data]) => {
          const response = await authenticatedFetchWithExpiration(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SHARDS(
                campaignId
              )
            ),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shardIds: data.shardIds,
                stagingKeys: data.stagingKeys,
              }),
              jwt,
            }
          );

          if (!response.response.ok) {
            throw new Error(
              `Failed to approve shards for campaign ${campaignId}`
            );
          }
        }
      );

      await Promise.all(approvalPromises);

      // Mark shards as processed
      setProcessedShards((prev) => new Set([...prev, ...selectedShards]));
      onShardsProcessed(Array.from(selectedShards));
      setSelectedShards(new Set());
    } catch (error) {
      console.error("Failed to approve shards:", error);
    } finally {
      setProcessing(null);
    }
  }, [selectedShards, shards, getJwt, onShardsProcessed]);

  const handleRejectAll = useCallback(async () => {
    if (selectedShards.size === 0 || !rejectionReason.trim()) return;

    const jwt = getJwt();
    if (!jwt) return;

    setProcessing("rejecting");

    try {
      // Group selected shards by campaign
      const shardsByCampaign: Record<
        string,
        { stagingKeys: string[]; shardIds: string[] }
      > = {};

      selectedShards.forEach((shardId) => {
        // Find the shard and its campaign
        for (const group of shards) {
          const shard = group.shards.find((s) => s.id === shardId);
          if (shard) {
            const campaignId = (group as any).campaignId;
            if (!shardsByCampaign[campaignId]) {
              shardsByCampaign[campaignId] = { stagingKeys: [], shardIds: [] };
            }
            shardsByCampaign[campaignId].shardIds.push(shardId);
            shardsByCampaign[campaignId].stagingKeys.push(group.key);
          }
        }
      });

      // Reject shards for each campaign
      const rejectionPromises = Object.entries(shardsByCampaign).map(
        async ([campaignId, data]) => {
          const response = await authenticatedFetchWithExpiration(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(
                campaignId
              )
            ),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shardIds: data.shardIds,
                stagingKeys: data.stagingKeys,
                reason: rejectionReason,
              }),
              jwt,
            }
          );

          if (!response.response.ok) {
            throw new Error(
              `Failed to reject shards for campaign ${campaignId}`
            );
          }
        }
      );

      await Promise.all(rejectionPromises);

      // Mark shards as processed
      setProcessedShards((prev) => new Set([...prev, ...selectedShards]));
      onShardsProcessed(Array.from(selectedShards));
      setSelectedShards(new Set());
      setRejectionReason("");
    } catch (error) {
      console.error("Failed to reject shards:", error);
    } finally {
      setProcessing(null);
    }
  }, [selectedShards, rejectionReason, shards, getJwt, onShardsProcessed]);

  if (isLoading) {
    return (
      <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (totalShards === 0) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white dark:bg-neutral-900">
        <div className="flex items-center justify-center p-8">
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400 mb-2">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No pending shards
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              All your knowledge fragments have been processed. New shards will
              appear here as they're generated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border border-gray-200 rounded-lg bg-white dark:bg-neutral-900">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-neutral-700">
        <ShardHeader
          action="show_staged"
          total={totalShards}
          campaignName={campaignInfo.campaignName}
          resourceName={campaignInfo.resourceName}
          shardType={undefined}
          selectedCount={selectedShards.size}
          totalShards={totalShards}
          onSelectAll={handleSelectAll}
        />

        <ShardActionBar
          selectedCount={selectedShards.size}
          processing={processing}
          action="show_staged"
          rejectionReason={rejectionReason}
          onRejectionReasonChange={setRejectionReason}
          onApprove={handleApproveAll}
          onReject={handleRejectAll}
        />

        {processedShards.size > 0 && (
          <div className="bg-green-900 dark:bg-green-900 border border-green-700 dark:border-green-700 rounded-lg p-3 mt-4">
            <p className="text-green-200 dark:text-green-200 text-sm">
              ✅ {processedShards.size} shard
              {processedShards.size !== 1 ? "s" : ""} processed successfully
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {Object.entries(shardsByCampaign).map(
            ([campaignId, campaignData]) => (
              <div key={campaignId} className="space-y-3">
                <div className="border-b border-neutral-600 dark:border-neutral-700 pb-2">
                  <h3 className="text-sm font-medium text-white dark:text-white">
                    {campaignData.campaignName}
                  </h3>
                  <p className="text-xs text-neutral-400 dark:text-neutral-400">
                    {campaignData.shards.reduce(
                      (total, group) => total + (group.shards?.length || 0),
                      0
                    )}{" "}
                    shards
                  </p>
                </div>

                {campaignData.shards.map((group) => (
                  <ShardGroup
                    key={group.key}
                    group={group}
                    selectedShards={selectedShards}
                    onShardSelection={handleShardSelection}
                    processingShard={null}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
