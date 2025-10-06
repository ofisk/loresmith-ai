import { useState, useEffect, useCallback } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { UnifiedShardManager } from "../chat/UnifiedShardManager";
import type { StagedShardGroup } from "../../types/shard";

interface ShardOverlayProps {
  shards: StagedShardGroup[];
  isLoading: boolean;
  onShardsProcessed: (shardIds: string[]) => void;
  getJwt: () => string | null;
  onAutoExpand?: () => void;
  onRefresh?: () => void;
}

export const ShardOverlay = ({
  shards,
  isLoading,
  onShardsProcessed,
  getJwt,
  onAutoExpand,
  onRefresh,
}: ShardOverlayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasNewShards, setHasNewShards] = useState(false);
  const [previousShardCount, setPreviousShardCount] = useState(0);

  const totalShards = shards.reduce(
    (total, group) => total + (group.shards?.length || 0),
    0
  );

  // Debug logging
  useEffect(() => {
    console.log("ShardOverlay received shards:", {
      shardsCount: shards.length,
      totalShards,
      shards: shards,
      isLoading,
    });
  }, [shards, totalShards, isLoading]);

  // Show loading state in button when fetching shards
  const displayCount = isLoading ? "..." : totalShards;

  // Auto-expand when new shards are found
  useEffect(() => {
    if (totalShards > previousShardCount && previousShardCount > 0) {
      setHasNewShards(true);
      setIsExpanded(true);
      onAutoExpand?.();
    }
    setPreviousShardCount(totalShards);
  }, [totalShards, previousShardCount, onAutoExpand]);

  // Clear new shards flag when expanded
  useEffect(() => {
    if (isExpanded) {
      setHasNewShards(false);
    }
  }, [isExpanded]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div className="fixed top-0 right-0 h-screen z-50 flex items-start pt-20">
      {/* Collapsed Button */}
      <div className="relative">
        <button
          type="button"
          onClick={toggleExpanded}
          className={`
            flex items-center justify-center w-12 h-12 rounded-l-lg shadow-lg border border-r-0 transition-all duration-300 ease-in-out
            ${
              isExpanded
                ? "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                : "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
            }
            ${hasNewShards ? "animate-pulse" : ""}
          `}
          title={
            isExpanded
              ? "Collapse shard panel"
              : `Show ${displayCount} pending shard${displayCount !== "..." && displayCount !== 1 ? "s" : ""}`
          }
        >
          {isExpanded ? (
            <CaretRight
              size={20}
              className="text-neutral-600 dark:text-neutral-400"
            />
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold">{displayCount}</span>
              <span className="text-xs">
                shard{displayCount !== "..." && displayCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Expanded Panel */}
      <div
        className={`
          bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xl
          transition-all duration-300 ease-in-out
          ${isExpanded ? "w-96 opacity-100" : "w-0 opacity-0 overflow-hidden"}
        `}
        style={{ height: "calc(100vh - 5rem)" }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 flex-shrink-0">
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">
              Pending Shards
            </h3>
            <div className="flex items-center gap-2">
              {hasNewShards && (
                <div
                  className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
                  title="New shards available"
                />
              )}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                  title="Refresh shards"
                >
                  <svg
                    className="w-4 h-4 text-neutral-600 dark:text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Refresh icon"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={toggleExpanded}
                className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                title="Collapse panel"
              >
                <CaretLeft
                  size={16}
                  className="text-neutral-600 dark:text-neutral-400"
                />
              </button>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="h-full">
              <UnifiedShardManager
                shards={shards}
                isLoading={isLoading}
                onShardsProcessed={onShardsProcessed}
                getJwt={getJwt}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
