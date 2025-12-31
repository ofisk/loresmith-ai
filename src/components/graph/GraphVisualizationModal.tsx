import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Modal } from "@/components/modal/Modal";
import { CytoscapeGraph } from "./CytoscapeGraph";
import { GraphControls } from "./GraphControls";
import { CommunityEntityView } from "./CommunityEntityView";
import { useGraphVisualization } from "@/hooks/useGraphVisualization";
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
  const [layout, setLayout] = useState<CytoscapeLayout>("cose");
  const [communitySearchTerm, setCommunitySearchTerm] = useState("");
  const [entitySearchTerm, setEntitySearchTerm] = useState("");
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
    filters,
    setFilters,
    resetFilters,
  } = useGraphVisualization({
    campaignId,
    enabled: isOpen,
  });

  // Use refs to store the latest function and filters to avoid dependency issues
  const fetchCommunityGraphRef = useRef(fetchCommunityGraph);
  const filtersRef = useRef(filters);

  useEffect(() => {
    fetchCommunityGraphRef.current = fetchCommunityGraph;
  }, [fetchCommunityGraph]);

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

    return () => clearTimeout(timeoutId);
  }, [isOpen, viewMode, filtersKey]);

  // Fetch entity graph data when a community is selected
  useEffect(() => {
    if (selectedCommunityId && viewMode === "entity") {
      fetchEntityGraph(selectedCommunityId);
    }
  }, [selectedCommunityId, viewMode, fetchEntityGraph]);

  // Handle community node click
  const handleCommunityNodeClick = useCallback((nodeId: string) => {
    setSelectedCommunityId(nodeId);
    setViewMode("entity");
  }, []);

  // Handle back to community view
  const handleBackToCommunity = useCallback(() => {
    setViewMode("community");
    setSelectedCommunityId(null);
  }, []);

  // Debounced entity search
  useEffect(() => {
    if (!entitySearchTerm.trim()) {
      setHighlightedNodes([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await searchEntity(entitySearchTerm);
    }, 500); // Wait 500ms after typing stops

    return () => clearTimeout(timeoutId);
  }, [entitySearchTerm, searchEntity]);

  // Update highlighted nodes when search results change
  useEffect(() => {
    if (searchResults) {
      const communityIds = searchResults.communities.map((c) => c.id);
      setHighlightedNodes(communityIds);
    } else if (!entitySearchTerm.trim()) {
      setHighlightedNodes([]);
    }
  }, [searchResults, entitySearchTerm]);

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

  // Filter community graph data by search term (client-side)
  const filteredCommunityGraphData = useMemo(() => {
    if (!communityGraphData) {
      console.log("[GraphVisualizationModal] No communityGraphData available");
      return null;
    }

    console.log("[GraphVisualizationModal] Community graph data:", {
      nodes: communityGraphData.nodes.length,
      edges: communityGraphData.edges.length,
      searchTerm: communitySearchTerm,
    });

    if (!communitySearchTerm.trim()) {
      return communityGraphData;
    }

    const searchLower = communitySearchTerm.toLowerCase();
    const filteredNodes = communityGraphData.nodes.filter((node) =>
      node.name.toLowerCase().includes(searchLower)
    );
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Only include edges between filtered nodes
    const filteredEdges = communityGraphData.edges.filter(
      (edge) =>
        filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }, [communityGraphData, communitySearchTerm]);

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
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-xl font-semibold">
            Graph visualization: {campaignName}
          </h2>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Controls sidebar */}
          <div className="w-64 flex-shrink-0 overflow-y-auto">
            <GraphControls
              filters={filters}
              onFiltersChange={setFilters}
              onResetFilters={resetFilters}
              communitySearchTerm={communitySearchTerm}
              onCommunitySearchChange={setCommunitySearchTerm}
              entitySearchTerm={entitySearchTerm}
              onEntitySearchChange={setEntitySearchTerm}
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
                  <CytoscapeGraph
                    data={filteredCommunityGraphData}
                    layout={layout}
                    onNodeClick={handleCommunityNodeClick}
                    highlightedNodes={highlightedNodes}
                    className="flex-1"
                  />
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
