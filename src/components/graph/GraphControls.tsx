import { useMemo } from "react";
import { MultiSelect } from "@/components/select/MultiSelect";
import { Button } from "@/components/button/Button";
import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity-types";
import { RELATIONSHIP_TYPES } from "@/lib/relationship-types";
import type {
  CommunityFilterState,
  EntityFilterState,
  CytoscapeLayout,
} from "@/types/graph-visualization";
import type { ShardStatus } from "@/types/shard";
import { cn } from "@/lib/utils";

interface GraphControlsProps {
  // Filter state
  filters: CommunityFilterState | EntityFilterState;
  onFiltersChange: (filters: CommunityFilterState | EntityFilterState) => void;
  onResetFilters: () => void;

  // Layout
  layout: CytoscapeLayout;
  onLayoutChange: (layout: CytoscapeLayout) => void;
  onResetView: () => void;

  // View mode
  viewMode: "community" | "entity";
  onExportPNG?: () => void;
  onExportSVG?: () => void;

  className?: string;
}

const LAYOUT_OPTIONS: Array<{ value: CytoscapeLayout; label: string }> = [
  { value: "breadthfirst", label: "Breadth first" },
  { value: "circle", label: "Circle" },
  { value: "concentric", label: "Concentric" },
  { value: "cose", label: "COSE" },
  { value: "grid", label: "Grid" },
  { value: "dagre", label: "Dagre" },
  { value: "preset", label: "Preset" },
  { value: "random", label: "Random" },
];

const APPROVAL_STATUS_OPTIONS: Array<{ value: ShardStatus; label: string }> = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "staging", label: "Staging" },
];

export function GraphControls({
  filters,
  onFiltersChange,
  onResetFilters,
  layout,
  onLayoutChange,
  onResetView,
  viewMode,
  onExportPNG,
  onExportSVG,
  className = "",
}: GraphControlsProps) {
  const entityTypeOptions = useMemo(
    () =>
      STRUCTURED_ENTITY_TYPES.map((type) => ({
        value: type,
        label: type,
      })),
    []
  );

  const relationshipTypeOptions = useMemo(
    () =>
      RELATIONSHIP_TYPES.map((type) => ({
        value: type,
        label: type,
      })),
    []
  );

  const handleEntityTypeChange = (values: string[]) => {
    onFiltersChange({
      ...filters,
      entityTypes: values as any[],
    });
  };

  const handleRelationshipTypeChange = (values: string[]) => {
    onFiltersChange({
      ...filters,
      relationshipTypes: values as any[],
    });
  };

  const handleApprovalStatusChange = (values: string[]) => {
    if (viewMode === "community") {
      onFiltersChange({
        ...filters,
        approvalStatuses: values as ShardStatus[],
      });
    }
  };

  const isCommunityView = viewMode === "community";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-4 border-r border-neutral-200 dark:border-neutral-700",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Filters</h3>

        {/* Entity type filter */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Entity types
          </span>
          <MultiSelect
            options={entityTypeOptions}
            selectedValues={filters.entityTypes?.map(String) || []}
            onSelectionChange={handleEntityTypeChange}
            placeholder="All entity types"
            size="sm"
          />
        </div>

        {/* Relationship type filter */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Relationship types
          </span>
          <MultiSelect
            options={relationshipTypeOptions}
            selectedValues={filters.relationshipTypes?.map(String) || []}
            onSelectionChange={handleRelationshipTypeChange}
            placeholder="All relationship types"
            size="sm"
          />
        </div>

        {/* Approval status filter (community view only) */}
        {isCommunityView && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              Approval status
            </span>
            <MultiSelect
              options={APPROVAL_STATUS_OPTIONS}
              selectedValues={
                (filters as CommunityFilterState).approvalStatuses?.map(
                  String
                ) || []
              }
              onSelectionChange={handleApprovalStatusChange}
              placeholder="All statuses"
              size="sm"
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFilters}
          className="mt-2"
        >
          Reset filters
        </Button>
      </div>

      {/* Layout */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Layout</h3>
        <select
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as CytoscapeLayout)}
          className="flex w-full rounded-md border border-gray-300 dark:border-gray-600 bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 focus-visible:border-blue-500 dark:focus-visible:border-blue-400"
        >
          {LAYOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={onResetView}>
          Reset view
        </Button>
      </div>

      {/* Export */}
      {(onExportPNG || onExportSVG) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Export</h3>
          <div className="flex flex-col gap-1">
            {onExportPNG && (
              <Button variant="secondary" size="sm" onClick={onExportPNG}>
                Export PNG
              </Button>
            )}
            {onExportSVG && (
              <Button variant="secondary" size="sm" onClick={onExportSVG}>
                Export SVG
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
