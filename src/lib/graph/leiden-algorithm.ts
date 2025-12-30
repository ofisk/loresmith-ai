/**
 * Leiden Algorithm for Community Detection
 *
 * Implementation of the Leiden algorithm for detecting communities in graphs.
 * The Leiden algorithm is an improvement over the Louvain algorithm that
 * guarantees well-connected communities.
 *
 * Reference: Traag, V. A., Waltman, L., & van Eck, N. J. (2019).
 * From Louvain to Leiden: guaranteeing well-connected communities.
 * Scientific reports, 9(1), 5233.
 */

export interface GraphNode {
  id: string;
  weight?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  adjacencyList: Map<string, Map<string, number>>; // node -> {neighbor -> weight}
  totalWeight: number;
}

export interface CommunityAssignment {
  nodeId: string;
  communityId: number;
}

export interface LeidenOptions {
  resolution?: number; // Resolution parameter (gamma), default 1.0
  randomSeed?: number; // For deterministic results
  maxIterations?: number; // Maximum iterations per level
  minImprovement?: number; // Minimum modularity improvement to continue
}

/**
 * Build a graph from edges
 */
export function buildGraph(edges: GraphEdge[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const adjacencyList = new Map<string, Map<string, number>>();
  let totalWeight = 0;

  for (const edge of edges) {
    // Add nodes
    if (!nodes.has(edge.from)) {
      nodes.set(edge.from, { id: edge.from });
    }
    if (!nodes.has(edge.to)) {
      nodes.set(edge.to, { id: edge.to });
    }

    // Build adjacency list (undirected graph)
    if (!adjacencyList.has(edge.from)) {
      adjacencyList.set(edge.from, new Map());
    }
    if (!adjacencyList.has(edge.to)) {
      adjacencyList.set(edge.to, new Map());
    }

    const fromNeighbors = adjacencyList.get(edge.from)!;
    const toNeighbors = adjacencyList.get(edge.to)!;

    // Add edge weight (sum if multiple edges exist)
    const existingWeight = fromNeighbors.get(edge.to) || 0;
    fromNeighbors.set(edge.to, existingWeight + edge.weight);
    toNeighbors.set(edge.from, existingWeight + edge.weight);

    totalWeight += edge.weight;
  }

  return { nodes, edges, adjacencyList, totalWeight };
}

/**
 * Calculate modularity of a partition
 */
function calculateModularity(
  graph: Graph,
  communities: Map<string, number>,
  resolution: number = 1.0
): number {
  let modularity = 0;
  const communityWeights = new Map<number, number>();
  const communityInternalEdges = new Map<number, number>();

  // Calculate total weight per community
  for (const [nodeId, communityId] of communities) {
    const nodeWeight = getNodeDegree(graph, nodeId);
    const current = communityWeights.get(communityId) || 0;
    communityWeights.set(communityId, current + nodeWeight);
  }

  // Calculate internal edges per community
  for (const edge of graph.edges) {
    const fromCommunity = communities.get(edge.from);
    const toCommunity = communities.get(edge.to);

    if (fromCommunity === toCommunity && fromCommunity !== undefined) {
      const current = communityInternalEdges.get(fromCommunity) || 0;
      communityInternalEdges.set(fromCommunity, current + edge.weight);
    }
  }

  // Calculate modularity
  for (const [communityId, internalWeight] of communityInternalEdges) {
    const totalWeight = communityWeights.get(communityId) || 0;
    const expectedWeight =
      (totalWeight * totalWeight) / (2 * graph.totalWeight);
    modularity +=
      internalWeight / graph.totalWeight -
      resolution * (expectedWeight / graph.totalWeight);
  }

  return modularity;
}

/**
 * Get the degree (sum of edge weights) of a node
 */
function getNodeDegree(graph: Graph, nodeId: string): number {
  const neighbors = graph.adjacencyList.get(nodeId);
  if (!neighbors) return 0;

  let degree = 0;
  for (const weight of neighbors.values()) {
    degree += weight;
  }
  return degree;
}

/**
 * Calculate the change in modularity if a node is moved to a different community
 */
function calculateModularityChange(
  graph: Graph,
  nodeId: string,
  fromCommunity: number,
  toCommunity: number,
  communities: Map<string, number>,
  resolution: number = 1.0
): number {
  const nodeDegree = getNodeDegree(graph, nodeId);
  const neighbors = graph.adjacencyList.get(nodeId);

  if (!neighbors) return 0;

  // Calculate connections to each community
  let connectionsToFrom = 0;
  let connectionsToTo = 0;
  let totalCommunityWeightFrom = 0;
  let totalCommunityWeightTo = 0;

  for (const [neighborId, weight] of neighbors) {
    const neighborCommunity = communities.get(neighborId);
    if (neighborCommunity === fromCommunity) {
      connectionsToFrom += weight;
      totalCommunityWeightFrom += getNodeDegree(graph, neighborId);
    }
    if (neighborCommunity === toCommunity) {
      connectionsToTo += weight;
      totalCommunityWeightTo += getNodeDegree(graph, neighborId);
    }
  }

  // Calculate modularity change
  const deltaQ =
    (2 * (connectionsToTo - connectionsToFrom)) / graph.totalWeight -
    (2 *
      resolution *
      nodeDegree *
      (totalCommunityWeightTo - totalCommunityWeightFrom)) /
      (graph.totalWeight * graph.totalWeight);

  return deltaQ;
}

/**
 * Local moving phase: move nodes to improve modularity
 */
function localMovingPhase(
  graph: Graph,
  communities: Map<string, number>,
  resolution: number,
  maxIterations: number = 10,
  randomFn: () => number = Math.random
): boolean {
  let improved = false;
  let iterations = 0;

  while (iterations < maxIterations) {
    let moved = false;
    const nodeIds = Array.from(graph.nodes.keys());

    // Shuffle nodes for better results
    for (let i = nodeIds.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [nodeIds[i], nodeIds[j]] = [nodeIds[j], nodeIds[i]];
    }

    for (const nodeId of nodeIds) {
      const currentCommunity = communities.get(nodeId)!;
      const neighbors = graph.adjacencyList.get(nodeId);

      if (!neighbors) continue;

      // Find best community to move to
      let bestCommunity = currentCommunity;
      let bestDelta = 0;

      const neighborCommunities = new Set<number>();
      neighborCommunities.add(currentCommunity);

      for (const neighborId of neighbors.keys()) {
        const neighborCommunity = communities.get(neighborId);
        if (neighborCommunity !== undefined) {
          neighborCommunities.add(neighborCommunity);
        }
      }

      for (const candidateCommunity of neighborCommunities) {
        if (candidateCommunity === currentCommunity) continue;

        const delta = calculateModularityChange(
          graph,
          nodeId,
          currentCommunity,
          candidateCommunity,
          communities,
          resolution
        );

        if (delta > bestDelta) {
          bestDelta = delta;
          bestCommunity = candidateCommunity;
        }
      }

      if (bestCommunity !== currentCommunity && bestDelta > 0) {
        communities.set(nodeId, bestCommunity);
        moved = true;
        improved = true;
      }
    }

    if (!moved) break;
    iterations++;
  }

  return improved;
}

/**
 * Refinement phase: ensure communities are well-connected
 */
function refinementPhase(graph: Graph, communities: Map<string, number>): void {
  // For each community, ensure it's well-connected
  // This is a simplified version - full Leiden algorithm has more sophisticated refinement
  const communityNodes = new Map<number, string[]>();

  for (const [nodeId, communityId] of communities) {
    if (!communityNodes.has(communityId)) {
      communityNodes.set(communityId, []);
    }
    communityNodes.get(communityId)!.push(nodeId);
  }

  // Check connectivity and split disconnected components
  for (const [communityId, nodes] of communityNodes) {
    if (nodes.length <= 1) continue;

    const components = findConnectedComponents(graph, nodes);
    if (components.length > 1) {
      // Split into separate communities
      let newCommunityId = communityId;
      for (let i = 1; i < components.length; i++) {
        newCommunityId = Math.max(...Array.from(communities.values())) + 1;
        for (const nodeId of components[i]) {
          communities.set(nodeId, newCommunityId);
        }
      }
    }
  }
}

/**
 * Find connected components in a subgraph
 */
function findConnectedComponents(graph: Graph, nodeIds: string[]): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue;

    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const neighbors = graph.adjacencyList.get(current);
      if (!neighbors) continue;

      for (const neighborId of neighbors.keys()) {
        if (nodeIds.includes(neighborId) && !visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Aggregate graph: create new graph where communities become nodes
 */
function aggregateGraph(graph: Graph, communities: Map<string, number>): Graph {
  const communityEdges = new Map<string, number>(); // "community1,community2" -> weight
  const communityNodes = new Set<number>();

  for (const communityId of communities.values()) {
    communityNodes.add(communityId);
  }

  for (const edge of graph.edges) {
    const fromCommunity = communities.get(edge.from);
    const toCommunity = communities.get(edge.to);

    if (fromCommunity === undefined || toCommunity === undefined) {
      continue;
    }

    if (fromCommunity === toCommunity) {
      // Self-loop
      const key = `${fromCommunity},${fromCommunity}`;
      const current = communityEdges.get(key) || 0;
      communityEdges.set(key, current + edge.weight);
    } else {
      // Regular edge (undirected, so use consistent ordering)
      const key =
        fromCommunity < toCommunity
          ? `${fromCommunity},${toCommunity}`
          : `${toCommunity},${fromCommunity}`;
      const current = communityEdges.get(key) || 0;
      communityEdges.set(key, current + edge.weight);
    }
  }

  const aggregatedEdges: GraphEdge[] = [];
  for (const [key, weight] of communityEdges) {
    const [from, to] = key.split(",").map(Number);
    aggregatedEdges.push({
      from: from.toString(),
      to: to.toString(),
      weight,
    });
  }

  return buildGraph(aggregatedEdges);
}

/**
 * Main Leiden algorithm
 */
export function leidenAlgorithm(
  graph: Graph,
  options: LeidenOptions = {}
): Map<string, number> {
  const resolution = options.resolution ?? 1.0;
  const maxIterations = options.maxIterations ?? 10;
  const minImprovement = options.minImprovement ?? 0.0001;

  // Simple seeded random generator (not cryptographically secure, but deterministic)
  let randomSeed = options.randomSeed;
  const seededRandom = (): number => {
    if (randomSeed === undefined) {
      return Math.random();
    }
    randomSeed = ((randomSeed ?? 0) * 9301 + 49297) % 233280;
    return randomSeed / 233280;
  };

  // Initialize: each node in its own community
  // Maintain mapping from original nodes to final communities throughout
  const originalCommunities = new Map<string, number>();
  let communityId = 0;
  for (const nodeId of graph.nodes.keys()) {
    originalCommunities.set(nodeId, communityId++);
  }

  // Communities map for current level (starts as copy of original)
  const communities = new Map(originalCommunities);
  let currentGraph = graph;
  let level = 0;

  while (true) {
    const initialModularity = calculateModularity(
      currentGraph,
      communities,
      resolution
    );

    // Local moving phase
    localMovingPhase(
      currentGraph,
      communities,
      resolution,
      maxIterations,
      seededRandom
    );

    // Refinement phase
    refinementPhase(currentGraph, communities);

    // Update original communities mapping based on current level communities
    if (level === 0) {
      // First level: communities map directly maps original nodes to communities
      originalCommunities.clear();
      for (const [nodeId, communityId] of communities) {
        originalCommunities.set(nodeId, communityId);
      }
    }

    const finalModularity = calculateModularity(
      currentGraph,
      communities,
      resolution
    );

    // Check if we should aggregate and continue
    if (finalModularity - initialModularity < minImprovement) {
      break;
    }

    // Aggregate graph for next level
    const aggregatedGraph = aggregateGraph(currentGraph, communities);

    // Update original communities: map through the aggregation
    // Each node in aggregatedGraph represents a community from the current level
    // Map original nodes to their new communities based on aggregated graph structure
    const communityToNewCommunity = new Map<number, number>();
    // Create initial communities for aggregated graph (each node in its own community)
    let newCommunityId = 0;
    for (const nodeId of aggregatedGraph.nodes.keys()) {
      communityToNewCommunity.set(Number(nodeId), newCommunityId++);
    }

    // Update original communities: for each original node, find its community ID
    // from the current level, then map it through to the new community ID
    const updatedOriginalCommunities = new Map<string, number>();
    for (const [originalNodeId, currentCommunityId] of originalCommunities) {
      // currentCommunityId is the community ID from the current (pre-aggregation) level
      // Map it to the new community ID for the next level
      const newCommunityId = communityToNewCommunity.get(currentCommunityId);
      if (newCommunityId !== undefined) {
        updatedOriginalCommunities.set(originalNodeId, newCommunityId);
      } else {
        // Keep original if mapping not found (shouldn't happen, but be safe)
        updatedOriginalCommunities.set(originalNodeId, currentCommunityId);
      }
    }
    originalCommunities.clear();
    for (const [nodeId, communityId] of updatedOriginalCommunities) {
      originalCommunities.set(nodeId, communityId);
    }

    // Create new communities map for the aggregated graph for next iteration
    // Each aggregated node starts in its own community
    communities.clear();
    for (const [nodeId, communityId] of communityToNewCommunity) {
      communities.set(nodeId.toString(), communityId);
    }

    currentGraph = aggregatedGraph;
    level++;

    // Prevent infinite loops
    if (level > 100) break;
  }

  return originalCommunities;
}

/**
 * Detect communities using Leiden algorithm and return as array of community assignments
 */
export function detectCommunities(
  edges: GraphEdge[],
  options: LeidenOptions = {}
): CommunityAssignment[] {
  const graph = buildGraph(edges);
  const communities = leidenAlgorithm(graph, options);

  return Array.from(communities.entries()).map(([nodeId, communityId]) => ({
    nodeId,
    communityId,
  }));
}
