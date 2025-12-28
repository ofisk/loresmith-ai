import { useState, useEffect, useCallback } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { UnifiedShardManager } from "@/components/chat/UnifiedShardManager";
import type { StagedShardGroup } from "@/types/shard";

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
  onAutoExpand: _onAutoExpand,
  onRefresh,
}: ShardOverlayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
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

  // Track new shards but don't auto-expand
  useEffect(() => {
    if (totalShards > previousShardCount && previousShardCount > 0) {
      setHasNewShards(true);
    }
    setPreviousShardCount(totalShards);
  }, [totalShards, previousShardCount]);

  // Clear new shards flag when expanded
  useEffect(() => {
    if (isExpanded) {
      setHasNewShards(false);
    }
  }, [isExpanded]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
    setIsMinimized(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    setIsMinimized(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isExpanded]);

  return (
    <div className="fixed top-0 right-0 h-screen z-50 flex items-start pt-28 pointer-events-none">
      {/* Minimized Chevron Button */}
      {!isExpanded && isMinimized && (
        <div className="relative pointer-events-auto">
          <button
            type="button"
            onClick={toggleExpanded}
            className={`
              flex items-center justify-center px-1 py-2 rounded-l-lg shadow-lg border border-r-0 transition-all duration-300 ease-in-out
              bg-neutral-200 dark:bg-neutral-800 text-purple-600 dark:text-purple-400 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700
              ${hasNewShards ? "animate-pulse" : ""}
            `}
            title={`Show ${displayCount} pending shard${displayCount !== "..." && displayCount !== 1 ? "s" : ""}`}
          >
            <CaretLeft size={16} weight="bold" />
          </button>
        </div>
      )}

      {/* Collapsed Button with Count */}
      {!isExpanded && !isMinimized && (
        <div className="relative pointer-events-auto">
          <button
            type="button"
            onClick={toggleExpanded}
            className={`
              flex items-center justify-center px-8 py-1.5 rounded-l-lg shadow-lg border border-r-0 transition-all duration-300 ease-in-out
              bg-neutral-200 dark:bg-neutral-800 text-purple-600 dark:text-purple-400 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700
              ${hasNewShards ? "animate-pulse" : ""}
            `}
            title={`Show ${displayCount} pending shard${displayCount !== "..." && displayCount !== 1 ? "s" : ""}`}
          >
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{displayCount}</span>
              <span className="text-xs">
                shard{displayCount !== "..." && displayCount !== 1 ? "s" : ""}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Expanded Panel */}
      <div
        className={`
          bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xl
          transition-all duration-300 ease-in-out
          ${isExpanded ? "w-[50vw] opacity-100 pointer-events-auto" : "w-0 opacity-0 overflow-hidden pointer-events-none"}
        `}
        style={{ height: "calc(100vh - 7rem)" }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                title="Close panel"
              >
                <CaretRight
                  size={20}
                  weight="bold"
                  className="text-neutral-600 dark:text-neutral-400"
                />
              </button>
              <h3 className="font-semibold text-neutral-800 dark:text-neutral-200">
                Pending shards {totalShards > 0 && `(${totalShards} total)`}
              </h3>
            </div>
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
                    className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
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
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <div className="h-full">
              <UnifiedShardManager
                shards={shards}
                isLoading={isLoading}
                onShardsProcessed={onShardsProcessed}
                getJwt={getJwt}
                onRefresh={onRefresh}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
