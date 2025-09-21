import React, { useState } from "react";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared";
import type { ShardCandidate, StagedShardGroup } from "../../types/shard";
import {
  EmptyState,
  ShardActionBar,
  ShardGroup,
  ShardHeader,
  ShardItem,
} from "./shard";

interface ShardManagementUIProps {
  campaignId: string;
  shards: StagedShardGroup[] | ShardCandidate[];
  total: number;
  status?: string;
  action?: string;
  resourceId?: string;
  shardType?: string;
  reason?: string;
  shardIds?: string[]; // For focused approval mode
}

export const ShardManagementUI: React.FC<ShardManagementUIProps> = ({
  campaignId,
  shards,
  total: _total,
  action = "show_staged",
  resourceId,
  shardType,
  reason: _reason,
  shardIds: _shardIds,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [processingShard, setProcessingShard] = useState<{
    id: string;
    action: "approving" | "rejecting" | null;
  } | null>(null);
  const [selectedShards, setSelectedShards] = useState<Set<string>>(new Set());
  const [rejectionReason, setRejectionReason] = useState("");
  const [processedShards, setProcessedShards] = useState<Set<string>>(
    new Set()
  );

  // Normalize data structure - convert ShardCandidate[] to StagedShardGroup[] format
  const normalizedShards: StagedShardGroup[] = React.useMemo(() => {
    if (shards.length === 0) return [];

    // Check if it's already StagedShardGroup[]
    if ("key" in shards[0] && "shards" in shards[0]) {
      return shards as StagedShardGroup[];
    }

    // Convert ShardCandidate[] to StagedShardGroup[] format
    const shardCandidates = shards as ShardCandidate[];
    return [
      {
        key: "focused_approval",
        sourceRef: shardCandidates[0]?.sourceRef || {
          fileKey: "",
          meta: {
            fileName: "",
            campaignId,
            entityType: "",
            chunkId: "",
            score: 0,
          },
        },
        shards: shardCandidates,
        created_at: new Date().toISOString(),
        campaignRagBasePath: `campaigns/${campaignId}`,
      },
    ];
  }, [shards, campaignId]);

  const handleShardSelection = (shardId: string, checked: boolean) => {
    const newSelected = new Set(selectedShards);
    if (checked) {
      newSelected.add(shardId);
    } else {
      newSelected.delete(shardId);
    }
    setSelectedShards(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allShardIds = normalizedShards.flatMap((group) =>
        group.shards.map((shard) => shard.id)
      );
      setSelectedShards(new Set(allShardIds));
    } else {
      setSelectedShards(new Set());
    }
  };

  const handleApproveSelected = async () => {
    if (selectedShards.size === 0) return;

    setProcessing("approving");
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("Authentication required");
      }

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SHARDS(
            campaignId
          )
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({ shardIds: Array.from(selectedShards) }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication expired");
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to approve shards");
      }

      // Mark shards as processed and clear selection
      setProcessedShards((prev) => new Set([...prev, ...selectedShards]));
      setSelectedShards(new Set());

      console.log(`Successfully approved ${selectedShards.size} shards`);
    } catch (error) {
      console.error("Error approving shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  const approveSingleShard = async (shardId: string) => {
    setProcessingShard({ id: shardId, action: "approving" });
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("Authentication required");
      }

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SHARDS(
            campaignId
          )
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({ shardIds: [shardId] }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication expired");
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to approve shard");
      }

      setProcessedShards((prev) => new Set([...prev, shardId]));
      setSelectedShards((prev) => {
        const copy = new Set(prev);
        copy.delete(shardId);
        return copy;
      });
    } catch (error) {
      console.error("Error approving shard:", error);
    } finally {
      setProcessingShard(null);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedShards.size === 0 || !rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("Authentication required");
      }

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(
            campaignId
          )
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            shardIds: Array.from(selectedShards),
            reason: rejectionReason.trim(),
          }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication expired");
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to reject shards");
      }

      // Mark shards as processed and clear selection
      setProcessedShards((prev) => new Set([...prev, ...selectedShards]));
      setSelectedShards(new Set());
      setRejectionReason("");

      console.log(`Successfully rejected ${selectedShards.size} shards`);
    } catch (error) {
      console.error("Error rejecting shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  const rejectSingleShard = async (shardId: string, reason: string) => {
    if (!reason.trim()) return;
    setProcessingShard({ id: shardId, action: "rejecting" });
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("Authentication required");
      }

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(
            campaignId
          )
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({ shardIds: [shardId], reason: reason.trim() }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication expired");
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to reject shard");
      }

      setProcessedShards((prev) => new Set([...prev, shardId]));
      setSelectedShards((prev) => {
        const copy = new Set(prev);
        copy.delete(shardId);
        return copy;
      });
    } catch (error) {
      console.error("Error rejecting shard:", error);
    } finally {
      setProcessingShard(null);
    }
  };

  const handleApproveAll = async () => {
    const allShardIds = normalizedShards.flatMap((group) =>
      group.shards.map((shard) => shard.id)
    );
    setSelectedShards(new Set(allShardIds));
    await handleApproveSelected();
  };

  const handleRejectAll = async () => {
    if (!rejectionReason.trim()) return;
    const allShardIds = normalizedShards.flatMap((group) =>
      group.shards.map((shard) => shard.id)
    );
    setSelectedShards(new Set(allShardIds));
    await handleRejectSelected();
  };

  // Filter out processed shards for display
  const visibleShards = normalizedShards
    .map((group) => ({
      ...group,
      shards: group.shards.filter((shard) => !processedShards.has(shard.id)),
    }))
    .filter((group) => group.shards.length > 0);

  const visibleShardCount = visibleShards.reduce(
    (total, group) => total + group.shards.length,
    0
  );

  if (visibleShards.length === 0) {
    return <EmptyState action={action} />;
  }

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
      <ShardHeader
        action={action}
        total={visibleShardCount}
        campaignId={campaignId}
        resourceId={resourceId}
        shardType={shardType}
        selectedCount={selectedShards.size}
        totalShards={visibleShardCount}
        onSelectAll={handleSelectAll}
      />

      <ShardActionBar
        selectedCount={selectedShards.size}
        processing={processing}
        action={action}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onApprove={handleApproveAll}
        onReject={handleRejectAll}
      />

      {processedShards.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-800 text-sm">
            ✅ {processedShards.size} shard
            {processedShards.size !== 1 ? "s" : ""} processed successfully
          </p>
        </div>
      )}

      <div className="space-y-4">
        {visibleShards.map((group) => {
          // If this is focused approval mode (single group with key 'focused_approval'), render individual shards
          if (group.key === "focused_approval") {
            return (
              <div key={group.key} className="space-y-3">
                {group.shards.map((shard) => (
                  <ShardItem
                    key={shard.id}
                    shard={{
                      id: shard.id,
                      text: shard.text,
                      metadata: {
                        entityType: shard.metadata.entityType,
                        confidence: shard.metadata.confidence,
                        query: shard.metadata.query,
                      },
                    }}
                    isSelected={selectedShards.has(shard.id)}
                    onSelectionChange={handleShardSelection}
                    onApprove={() => approveSingleShard(shard.id)}
                    onReject={(reason) => rejectSingleShard(shard.id, reason)}
                    isApproving={
                      processingShard?.id === shard.id &&
                      processingShard.action === "approving"
                    }
                    isRejecting={
                      processingShard?.id === shard.id &&
                      processingShard.action === "rejecting"
                    }
                  />
                ))}
              </div>
            );
          }

          // Otherwise, render as grouped shards
          return (
            <ShardGroup
              key={group.key}
              group={group}
              selectedShards={selectedShards}
              onShardSelection={handleShardSelection}
              onApproveOne={approveSingleShard}
              onRejectOne={rejectSingleShard}
              processingShard={processingShard}
            />
          );
        })}
      </div>

      {selectedShards.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-blue-800 text-sm">
              {selectedShards.size} shard{selectedShards.size !== 1 ? "s" : ""}{" "}
              selected
            </p>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleApproveSelected}
                disabled={processing === "approving"}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                {processing === "approving"
                  ? "Approving..."
                  : "Approve Selected"}
              </button>
              <button
                type="button"
                onClick={handleRejectSelected}
                disabled={processing === "rejecting" || !rejectionReason.trim()}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
              >
                {processing === "rejecting"
                  ? "Rejecting..."
                  : "Reject Selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
