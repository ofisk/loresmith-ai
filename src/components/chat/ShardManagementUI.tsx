import type React from "react";
import { useState, useMemo } from "react";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";
import type { ShardCandidate, StagedShardGroup } from "../../types/shard";
import { ShardGrid } from "../shard/ShardGrid";
import {
  convertStagedShardGroupsToShards,
  convertShardCandidatesToShards,
  convertShardToUpdate,
} from "../shard/shardAdapters";
import type { Shard } from "../shard/ShardTypeDetector";

interface ShardManagementUIProps {
  campaignId: string;
  shards?: StagedShardGroup[] | ShardCandidate[];
  total?: number;
  status?: string;
  action?: string;
  resourceId?: string;
  resourceName?: string;
  shardType?: string;
  reason?: string;
  shardIds?: string[]; // For focused approval mode
  onShardsUpdated?: () => Promise<void>; // Callback to refresh shard data from parent
}

export const ShardManagementUI: React.FC<ShardManagementUIProps> = ({
  campaignId,
  shards,
  total: _total,
  action = "show_staged",
  resourceId: _resourceId,
  resourceName,
  shardType,
  reason: _reason,
  shardIds: _shardIds,
  onShardsUpdated,
}) => {
  console.log("[ShardManagementUI] Component props:", {
    campaignId,
    shards,
    total: _total,
    action,
    resourceId: _resourceId,
    resourceName,
    shardType,
    reason: _reason,
    shardIds: _shardIds,
  });

  const [processing, setProcessing] = useState<string | null>(null);
  const [processedShards, setProcessedShards] = useState<Set<string>>(
    new Set()
  );
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Shard>>>(
    {}
  );

  // Convert the shard data to our new format and apply local edits
  const convertedShards = useMemo(() => {
    if (!shards) return [];

    let baseShards: Shard[] = [];
    if (Array.isArray(shards)) {
      // Check if it's an array of StagedShardGroup or ShardCandidate
      if (shards.length > 0 && "shards" in shards[0]) {
        baseShards = convertStagedShardGroupsToShards(
          shards as StagedShardGroup[]
        );
      } else {
        baseShards = convertShardCandidatesToShards(shards as ShardCandidate[]);
      }
    }

    // Apply local edits
    return baseShards.map((shard) => {
      const localEdit = localEdits[shard.id];
      return localEdit ? { ...shard, ...localEdit } : shard;
    });
  }, [shards, localEdits]);

  // Get resource name from the first shard if not provided
  const displayResourceName =
    resourceName ||
    (convertedShards.length > 0 && "sourceRef" in convertedShards[0]
      ? convertedShards[0].sourceRef?.meta?.fileName
      : undefined);

  const handleShardEdit = async (shardId: string, updates: Partial<Shard>) => {
    console.log(`[ShardManagementUI] Editing shard ${shardId}:`, updates);

    // Immediately apply the edit locally for instant UI feedback
    setLocalEdits((prev) => ({
      ...prev,
      [shardId]: { ...prev[shardId], ...updates },
    }));

    try {
      setProcessing("editing");

      // Find the original shard to get the source data
      const originalShard = convertedShards.find((s) => s.id === shardId);
      if (!originalShard) {
        console.error(`[ShardManagementUI] Could not find shard ${shardId}`);
        return;
      }

      // Find the original ShardCandidate to get the full structure
      let originalCandidate: ShardCandidate | null = null;
      if (Array.isArray(shards)) {
        for (const item of shards) {
          if ("shards" in item) {
            // StagedShardGroup
            const found = item.shards.find((s) => s.id === shardId);
            if (found) {
              originalCandidate = found;
              break;
            }
          } else {
            // ShardCandidate
            if (item.id === shardId) {
              originalCandidate = item;
              break;
            }
          }
        }
      }

      if (!originalCandidate) {
        console.error(
          `[ShardManagementUI] Could not find original candidate for shard ${shardId}`
        );
        return;
      }

      // Convert the updated shard back to the format expected by the API
      const updateData = convertShardToUpdate(
        { ...originalShard, ...updates },
        originalCandidate
      );

      // Make the API call to update the shard
      // Since the current system doesn't support direct shard editing, we'll treat this as a re-approval process
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token available");
      }

      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.UPDATE_SHARD(
            campaignId,
            shardId
          )
        ),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update shard: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[ShardManagementUI] Shard update result:`, result);

      // Clear the local edit since the server now has the updated data
      setLocalEdits((prev) => {
        const { [shardId]: _, ...rest } = prev;
        return rest;
      });

      // Trigger refresh of shard data from parent component
      if (onShardsUpdated) {
        await onShardsUpdated();
      }
    } catch (error) {
      console.error(
        `[ShardManagementUI] Error editing shard ${shardId}:`,
        error
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleShardDelete = async (shardId: string) => {
    console.log(`[ShardManagementUI] Deleting shard ${shardId}`);

    try {
      setProcessing("deleting");

      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token available");
      }

      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(
            campaignId
          )
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            shardIds: [shardId],
            reason: "User deleted shard",
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete shard: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[ShardManagementUI] Shard delete result:`, result);

      // Trigger refresh of shard data from parent component
      if (onShardsUpdated) {
        await onShardsUpdated();
      }
    } catch (error) {
      console.error(
        `[ShardManagementUI] Error deleting shard ${shardId}:`,
        error
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleBulkAction = async (action: string, shardIds: string[]) => {
    console.log(
      `[ShardManagementUI] Bulk action ${action} on shards:`,
      shardIds
    );

    try {
      setProcessing(action);

      // OPTIMISTIC UPDATE: Immediately mark shards as processed to prevent double-clicks
      setProcessedShards((prev) => {
        const newSet = new Set(prev);
        for (const id of shardIds) {
          newSet.add(id);
        }
        return newSet;
      });

      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token available");
      }

      // Find the staging keys for the selected shards
      const stagingKeys: string[] = [];
      if (shards && Array.isArray(shards)) {
        for (const group of shards as StagedShardGroup[]) {
          const groupShardIds = group.shards.map((shard) => shard.id);
          const hasSelectedShards = shardIds.some((id) =>
            groupShardIds.includes(id)
          );
          if (hasSelectedShards) {
            stagingKeys.push(group.key);
          }
        }
      }

      console.log(`[ShardManagementUI] Found staging keys:`, stagingKeys);

      const endpoint =
        action === "approve"
          ? API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SHARDS(
              campaignId
            )
          : API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SHARDS(
              campaignId
            );

      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(endpoint),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            shardIds,
            stagingKeys,
            reason: action === "reject" ? "Bulk rejection" : undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        // Handle specific error cases
        if (errorText.includes("Staging file not found")) {
          console.warn(
            `[ShardManagementUI] Staging files already processed for ${action}`
          );
          // This is actually a success case - the files were already moved
          // Don't throw an error, just refresh the UI
        } else {
          throw new Error(`Failed to ${action} shards: ${errorText}`);
        }
      } else {
        const result = await response.json();
        console.log(`[ShardManagementUI] Bulk ${action} result:`, result);
      }

      // Trigger refresh of shard data from parent component
      // Add a small delay to ensure backend operations complete
      if (onShardsUpdated) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
        await onShardsUpdated();
      }
    } catch (error) {
      console.error(
        `[ShardManagementUI] Error with bulk action ${action}:`,
        error
      );

      // Revert optimistic update on error
      setProcessedShards((prev) => {
        const newSet = new Set(prev);
        for (const id of shardIds) {
          newSet.delete(id);
        }
        return newSet;
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleRefresh = async () => {
    console.log("[ShardManagementUI] Refreshing shards...");

    try {
      setProcessing("refreshing");

      // Refresh shards by refetching from the API
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token available");
      }

      // Fetch the latest staged shards from the API
      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SHARDS(
            campaignId
          )
        ),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh shards: ${errorText}`);
      }

      const result = (await response.json()) as { shards: StagedShardGroup[] };
      console.log(`[ShardManagementUI] Shard refresh result:`, result);

      // Use callback to refresh shard data from parent component
      if (onShardsUpdated) {
        await onShardsUpdated();
      }
    } catch (error) {
      console.error("[ShardManagementUI] Error refreshing shards:", error);
    } finally {
      setProcessing(null);
    }
  };

  // Show loading state
  if (processing && convertedShards.length === 0) {
    return (
      <div className="space-y-4 border border-gray-700 rounded-lg p-4 bg-gray-800">
        <div className="text-center py-8">
          <div className="text-gray-300">Loading shards...</div>
        </div>
      </div>
    );
  }

  // Filter out processed shards for display
  const displayShards = convertedShards.filter(
    (shard) => !processedShards.has(shard.id)
  );
  const processedCount = convertedShards.length - displayShards.length;

  // Show empty state
  if (convertedShards.length === 0) {
    return (
      <div className="space-y-4 border border-gray-700 rounded-lg p-4 bg-gray-800">
        <div className="text-center py-8">
          <div className="text-gray-300">No shards found.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Success message */}
      {processedCount > 0 && (
        <div className="bg-green-900 border border-green-700 rounded-lg p-3">
          <p className="text-green-300 text-sm">
            ✅ {processedCount} shard
            {processedCount !== 1 ? "s" : ""} processed successfully
          </p>
        </div>
      )}

      {/* Show processing state */}
      {processing && (
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-300 text-sm">🔄 {processing} shards...</p>
        </div>
      )}

      {/* Use our new ShardGrid component */}
      <ShardGrid
        shards={displayShards}
        campaignId={campaignId}
        resourceName={displayResourceName}
        onShardEdit={handleShardEdit}
        onShardDelete={handleShardDelete}
        onBulkAction={handleBulkAction}
        onRefresh={handleRefresh}
      />
    </div>
  );
};
