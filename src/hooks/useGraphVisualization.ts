import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { API_CONFIG } from "@/shared-config";
import type {
  CommunityGraphData,
  EntityGraphData,
  EntitySearchResult,
  CommunityFilterState,
} from "@/types/graph-visualization";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";

interface UseGraphVisualizationOptions {
  campaignId: string;
  enabled?: boolean;
}

interface UseGraphVisualizationReturn {
  // Community-level graph data
  communityGraphData: CommunityGraphData | null;
  loadingCommunityGraph: boolean;
  errorCommunityGraph: string | null;
  fetchCommunityGraph: (filters?: CommunityFilterState) => Promise<void>;

  // Entity-level graph data
  entityGraphData: EntityGraphData | null;
  loadingEntityGraph: boolean;
  errorEntityGraph: string | null;
  fetchEntityGraph: (communityId: string) => Promise<void>;

  // Entity search
  searchResults: EntitySearchResult | null;
  loadingSearch: boolean;
  errorSearch: string | null;
  searchEntity: (entityName: string) => Promise<void>;

  // Filter state
  filters: CommunityFilterState;
  setFilters: (filters: CommunityFilterState) => void;
  resetFilters: () => void;
}

export function useGraphVisualization({
  campaignId,
  enabled = true,
}: UseGraphVisualizationOptions): UseGraphVisualizationReturn {
  const { makeRequestWithData } = useAuthenticatedRequest();

  const [communityGraphData, setCommunityGraphData] =
    useState<CommunityGraphData | null>(null);
  const [entityGraphData, setEntityGraphData] =
    useState<EntityGraphData | null>(null);
  const [searchResults, setSearchResults] = useState<EntitySearchResult | null>(
    null
  );
  const [filters, setFilters] = useState<CommunityFilterState>({});
  const filtersRef = useRef<CommunityFilterState>(filters);

  // Keep ref in sync with state
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Fetch community-level graph data
  const fetchCommunityGraphFn = useMemo(
    () => async (filtersToApply?: CommunityFilterState) => {
      const activeFilters = filtersToApply ?? filtersRef.current;
      const params = new URLSearchParams();

      if (activeFilters.entityTypes && activeFilters.entityTypes.length > 0) {
        params.append("entityTypes", activeFilters.entityTypes.join(","));
      }
      if (
        activeFilters.relationshipTypes &&
        activeFilters.relationshipTypes.length > 0
      ) {
        params.append(
          "relationshipTypes",
          activeFilters.relationshipTypes.join(",")
        );
      }
      if (
        activeFilters.approvalStatuses &&
        activeFilters.approvalStatuses.length > 0
      ) {
        params.append(
          "approvalStatuses",
          activeFilters.approvalStatuses.join(",")
        );
      }

      const url =
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.BASE(campaignId)
        ) + (params.toString() ? `?${params.toString()}` : "");

      const data = await makeRequestWithData<CommunityGraphData>(url);
      return data;
    },
    [campaignId, makeRequestWithData]
  );

  const {
    execute: fetchCommunityGraphExecute,
    loading: loadingCommunityGraph,
    error: errorCommunityGraph,
  } = useBaseAsync(fetchCommunityGraphFn, {
    onSuccess: (data) => {
      console.log("[useGraphVisualization] Received community graph data:", {
        nodes: data.nodes.length,
        edges: data.edges.length,
      });
      setCommunityGraphData(data);
    },
    errorMessage: "Failed to load graph visualization",
  });

  const fetchCommunityGraph = useCallback(
    async (filtersToApply?: CommunityFilterState) => {
      // Use the provided filters or current filters from ref
      const activeFilters = filtersToApply ?? filtersRef.current;
      await fetchCommunityGraphExecute(activeFilters);
    },
    [fetchCommunityGraphExecute]
  );

  // Fetch entity-level graph data for a community
  const fetchEntityGraphFn = useMemo(
    () => async (communityId: string) => {
      const url = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.COMMUNITY(
          campaignId,
          communityId
        )
      );

      const data = await makeRequestWithData<EntityGraphData>(url);
      return data;
    },
    [campaignId, makeRequestWithData]
  );

  const {
    execute: fetchEntityGraphExecute,
    loading: loadingEntityGraph,
    error: errorEntityGraph,
  } = useBaseAsync(fetchEntityGraphFn, {
    onSuccess: (data) => {
      setEntityGraphData(data);
    },
    errorMessage: "Failed to load entity graph",
  });

  const fetchEntityGraph = useCallback(
    async (communityId: string) => {
      await fetchEntityGraphExecute(communityId);
    },
    [fetchEntityGraphExecute]
  );

  // Search for entities
  const searchEntityFn = useMemo(
    () => async (entityName: string) => {
      const url =
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.GRAPH_VISUALIZATION.SEARCH_ENTITY(
            campaignId
          )
        ) + `?entityName=${encodeURIComponent(entityName)}`;

      const data = await makeRequestWithData<EntitySearchResult>(url);
      return data;
    },
    [campaignId, makeRequestWithData]
  );

  const {
    execute: searchEntityExecute,
    loading: loadingSearch,
    error: errorSearch,
  } = useBaseAsync(searchEntityFn, {
    onSuccess: (data) => {
      setSearchResults(data);
    },
    errorMessage: "Failed to search entity",
  });

  const searchEntity = useCallback(
    async (entityName: string) => {
      await searchEntityExecute(entityName);
    },
    [searchEntityExecute]
  );

  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    communityGraphData,
    loadingCommunityGraph,
    errorCommunityGraph,
    fetchCommunityGraph,
    entityGraphData,
    loadingEntityGraph,
    errorEntityGraph,
    fetchEntityGraph,
    searchResults,
    loadingSearch,
    errorSearch,
    searchEntity,
    filters,
    setFilters,
    resetFilters,
  };
}
