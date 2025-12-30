import { Button } from "@/components/button/Button";
import { CytoscapeGraph } from "./CytoscapeGraph";
import type {
  EntityGraphData,
  CytoscapeLayout,
} from "@/types/graph-visualization";
import { cn } from "@/lib/utils";

interface CommunityEntityViewProps {
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
  communityId,
  entityGraphData,
  loading,
  error,
  layout,
  onLayoutChange,
  onBack,
  className = "",
}: CommunityEntityViewProps) {
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

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center gap-4 p-4 border-b border-neutral-200 dark:border-neutral-700">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to communities
        </Button>
        <h2 className="text-lg font-semibold">
          Community: {communityId.slice(0, 8)}
        </h2>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {entityGraphData.nodes.length} entities,{" "}
          {entityGraphData.edges.length} relationships
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <CytoscapeGraph data={entityGraphData} layout={layout} />
      </div>
    </div>
  );
}
