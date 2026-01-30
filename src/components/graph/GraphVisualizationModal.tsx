import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Modal } from "@/components/modal/Modal";
import { CytoscapeGraph } from "./CytoscapeGraph";
import { EntityDetailPanel } from "./EntityDetailPanel";
import { GraphControls } from "./GraphControls";
import { CommunityEntityView } from "./CommunityEntityView";
import { useGraphVisualization } from "@/hooks/useGraphVisualization";
import { cn } from "@/lib/utils";
import type {
  CytoscapeLayout,
  GraphViewMode,
} from "@/types/graph-visualization";

interface GraphVisualizationModalProps {
  campaignId: string;
  campaignName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function GraphVisualizationModal({
  campaignId,
  campaignName,
  isOpen,
  onClose,
}: GraphVisualizationModalProps) {
  const [viewMode, setViewMode] = useState<GraphViewMode>("community");
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    null
  );
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [layout, setLayout] = useState<CytoscapeLayout>("cose");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);

  const {
    communityGraphData,
    loadingCommunityGraph,
    errorCommunityGraph,
    fetchCommunityGraph,
    entityGraphData,
    loadingEntityGraph,
    errorEntityGraph,
    fetchEntityGraph,
    searchResults,
    searchEntity,
    loadingSearch,
    errorSearch,
    filters,
    setFilters,
    resetFilters,
  } = useGraphVisualization({
    campaignId,
    enabled: isOpen,
  });

  // Use refs to store the latest function and filters to avoid dependency issues
  const fetchCommunityGraphRef = useRef(fetchCommunityGraph);
  const fetchEntityGraphRef = useRef(fetchEntityGraph);
  const filtersRef = useRef(filters);

  useEffect(() => {
    fetchCommunityGraphRef.current = fetchCommunityGraph;
  }, [fetchCommunityGraph]);

  useEffect(() => {
    fetchEntityGraphRef.current = fetchEntityGraph;
  }, [fetchEntityGraph]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Serialize filters to prevent unnecessary re-renders
  const filtersKey = useMemo(
    () => JSON.stringify(filters),
    [
      filters.entityTypes?.join(","),
      filters.relationshipTypes?.join(","),
      filters.approvalStatuses?.join(","),
      filters.communityLevel,
      filters.communitySizeMin,
      filters.communitySizeMax,
    ]
  );

  // Fetch community graph data when modal opens or filters change
  useEffect(() => {
    console.log("[GraphVisualizationModal] useEffect triggered:", {
      isOpen,
      viewMode,
      filtersKey,
    });

    if (!isOpen || viewMode !== "community") {
      console.log("[GraphVisualizationModal] Skipping fetch:", {
        isOpen,
        viewMode,
      });
      return;
    }

    console.log(
      "[GraphVisualizationModal] Triggering fetch with filters:",
      filtersRef.current
    );

    // Use a small delay to debounce rapid filter changes
    const timeoutId = setTimeout(() => {
      console.log("[GraphVisualizationModal] Executing fetchCommunityGraph");
      fetchCommunityGraphRef.current(filtersRef.current);
    }, 100);

    return () => {
      console.log("[GraphVisualizationModal] Cleaning up timeout");
      clearTimeout(timeoutId);
    };
  }, [isOpen, viewMode, filtersKey]);

  // Fetch entity graph data when a community is selected
  useEffect(() => {
    if (selectedCommunityId && viewMode === "entity") {
      fetchEntityGraphRef.current(selectedCommunityId);
    }
  }, [selectedCommunityId, viewMode]);

  const orphanNodeIds = useMemo(() => {
    if (!communityGraphData?.nodes) return new Set<string>();
    return new Set(
      communityGraphData.nodes
        .filter((n) => "isOrphan" in n && n.isOrphan)
        .map((n) => n.id)
    );
  }, [communityGraphData?.nodes]);

  // Handle community node click: show entity details for orphans, drill to community for communities
  const handleCommunityNodeClick = useCallback(
    (nodeId: string) => {
      if (orphanNodeIds.has(nodeId)) {
        setSelectedEntityId(nodeId);
        return;
      }
      setSelectedEntityId(null);
      setSelectedCommunityId(nodeId);
      setViewMode("entity");
    },
    [orphanNodeIds]
  );

  const handleCloseEntityDetail = useCallback(() => {
    setSelectedEntityId(null);
  }, []);

  // Handle back to community view
  const handleBackToCommunity = useCallback(() => {
    setViewMode("community");
    setSelectedCommunityId(null);
    setSelectedEntityId(null);
  }, []);

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (q) searchEntity(q);
  }, [searchQuery, searchEntity]);

  // Update highlighted nodes when search results change (communities + entity nodes so orphans highlight)
  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      const communityIds = new Set(
        searchResults.flatMap((r) => r.communities.map((c) => c.id))
      );
      const entityIds = new Set(searchResults.map((r) => r.entityId));
      setHighlightedNodes([...communityIds, ...entityIds]);
    } else {
      setHighlightedNodes([]);
    }
  }, [searchResults]);

  // Handle export PNG
  const handleExportPNG = useCallback(() => {
    // This will be implemented when we add export functionality
    console.log("Export PNG - to be implemented");
  }, []);

  // Handle export SVG
  const handleExportSVG = useCallback(() => {
    // This will be implemented when we add export functionality
    console.log("Export SVG - to be implemented");
  }, []);

  // Handle reset view
  const handleResetView = useCallback(() => {
    // This will reset zoom/pan in Cytoscape
    console.log("Reset view - to be implemented");
  }, []);

  const filteredCommunityGraphData = communityGraphData;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardStyle={{
        width: "90vw",
        height: "90vh",
        maxWidth: "1400px",
        maxHeight: "90vh",
      }}
    >
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold shrink-0">
              Graph visualization: {campaignName}
            </h2>
            <div className="flex items-center gap-2 min-w-0 flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by name or topic..."
                className="flex flex-1 min-w-0 rounded-md border border-gray-300 dark:border-gray-600 bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400"
                aria-label="Search entities"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={!searchQuery.trim() || loadingSearch}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400"
              >
                Search
              </button>
              {loadingSearch && (
                <span
                  className="shrink-0 h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
          {errorSearch && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorSearch}
            </p>
          )}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Controls sidebar */}
          <div className="w-64 flex-shrink-0 overflow-y-auto">
            <GraphControls
              filters={filters}
              onFiltersChange={setFilters}
              onResetFilters={resetFilters}
              layout={layout}
              onLayoutChange={setLayout}
              onResetView={handleResetView}
              viewMode={viewMode}
              onExportPNG={handleExportPNG}
              onExportSVG={handleExportSVG}
            />
          </div>

          {/* Graph view */}
          <div className="flex-1 min-w-0 flex flex-col">
            {viewMode === "community" ? (
              <>
                {loadingCommunityGraph ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-neutral-600 dark:text-neutral-400">
                      Loading graph...
                    </div>
                  </div>
                ) : errorCommunityGraph ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-red-600 dark:text-red-400">
                      {errorCommunityGraph}
                    </div>
                  </div>
                ) : filteredCommunityGraphData ? (
                  <div
                    className={cn(
                      "flex-1 min-h-0 flex",
                      selectedEntityId && "gap-0"
                    )}
                  >
                    <div
                      className={cn(
                        "min-w-0 flex-1",
                        selectedEntityId && "w-2/3"
                      )}
                    >
                      <CytoscapeGraph
                        data={filteredCommunityGraphData}
                        layout={layout}
                        onNodeClick={handleCommunityNodeClick}
                        highlightedNodes={highlightedNodes}
                        className="h-full"
                      />
                    </div>
                    {selectedEntityId && (
                      <div className="w-1/3 min-w-0 border-l border-neutral-200 dark:border-neutral-700 flex-shrink-0">
                        <EntityDetailPanel
                          campaignId={campaignId}
                          entityId={selectedEntityId}
                          onClose={handleCloseEntityDetail}
                          className="h-full"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-neutral-600 dark:text-neutral-400">
                      No graph data available
                    </div>
                  </div>
                )}
              </>
            ) : (
              <CommunityEntityView
                campaignId={campaignId}
                communityId={selectedCommunityId || ""}
                entityGraphData={entityGraphData}
                loading={loadingEntityGraph}
                error={errorEntityGraph}
                layout={layout}
                onLayoutChange={setLayout}
                onBack={handleBackToCommunity}
                className="flex-1"
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
