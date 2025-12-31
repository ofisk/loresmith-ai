import { useState } from "react";
import { Button } from "@/components/button/Button";
import { CytoscapeGraph } from "./CytoscapeGraph";
import { EntityDetailPanel } from "./EntityDetailPanel";
import type {
  EntityGraphData,
  CytoscapeLayout,
} from "@/types/graph-visualization";
import { cn } from "@/lib/utils";

interface CommunityEntityViewProps {
  campaignId: string;
  communityId: string;
  entityGraphData: EntityGraphData | null;
  loading: boolean;
  error: string | null;
  layout: CytoscapeLayout;
  onLayoutChange: (layout: CytoscapeLayout) => void;
  onBack: () => void;
  className?: string;
}

export function CommunityEntityView({
  campaignId,
  communityId,
  entityGraphData,
  loading,
  error,
  layout,
  onLayoutChange,
  onBack,
  className = "",
}: CommunityEntityViewProps) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-neutral-600 dark:text-neutral-400">
          Loading entities...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full gap-4",
          className
        )}
      >
        <div className="text-red-600 dark:text-red-400">{error}</div>
        <Button variant="secondary" onClick={onBack}>
          Back to communities
        </Button>
      </div>
    );
  }

  if (!entityGraphData) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full gap-4",
          className
        )}
      >
        <div className="text-neutral-600 dark:text-neutral-400">
          No entity data available
        </div>
        <Button variant="secondary" onClick={onBack}>
          Back to communities
        </Button>
      </div>
    );
  }

  const handleEntityNodeClick = (nodeId: string) => {
    setSelectedEntityId(nodeId);
  };

  const handleCloseDetailPanel = () => {
    setSelectedEntityId(null);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center gap-4 p-4 border-b border-neutral-200 dark:border-neutral-700">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to communities
        </Button>
        <h2 className="text-lg font-semibold">
          {entityGraphData.communityName ||
            `Community: ${communityId.slice(0, 8)}`}
        </h2>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {entityGraphData.nodes.length} entities,{" "}
          {entityGraphData.edges.length} relationships
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className={cn("flex-1 min-w-0", selectedEntityId && "w-2/3")}>
          <CytoscapeGraph
            data={entityGraphData}
            layout={layout}
            onNodeClick={handleEntityNodeClick}
          />
        </div>
        {selectedEntityId && (
          <div className="w-1/3 min-w-0 border-l border-neutral-200 dark:border-neutral-700">
            <EntityDetailPanel
              campaignId={campaignId}
              entityId={selectedEntityId}
              onClose={handleCloseDetailPanel}
              className="h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
