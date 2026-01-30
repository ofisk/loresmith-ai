import { describe, it, expect } from "vitest";
import {
  buildGraph,
  detectCommunities,
  leidenAlgorithm,
  type GraphEdge,
  type Graph,
} from "@/lib/graph/leiden-algorithm";

describe("buildGraph", () => {
  it("builds graph from empty edges", () => {
    const graph = buildGraph([]);
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.adjacencyList.size).toBe(0);
    expect(graph.totalWeight).toBe(0);
  });

  it("builds graph from single edge", () => {
    const edges: GraphEdge[] = [{ from: "a", to: "b", weight: 1 }];
    const graph = buildGraph(edges);
    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.has("a")).toBe(true);
    expect(graph.nodes.has("b")).toBe(true);
    expect(graph.edges).toHaveLength(1);
    expect(graph.totalWeight).toBe(1);
    expect(graph.adjacencyList.get("a")?.get("b")).toBe(1);
    expect(graph.adjacencyList.get("b")?.get("a")).toBe(1);
  });

  it("builds graph from multiple edges and sums duplicate edge weights", () => {
    const edges: GraphEdge[] = [
      { from: "a", to: "b", weight: 1 },
      { from: "b", to: "c", weight: 2 },
      { from: "a", to: "b", weight: 1 },
    ];
    const graph = buildGraph(edges);
    expect(graph.nodes.size).toBe(3);
    expect(graph.totalWeight).toBe(4);
    expect(graph.adjacencyList.get("a")?.get("b")).toBe(2);
    expect(graph.adjacencyList.get("b")?.get("a")).toBe(2);
    expect(graph.adjacencyList.get("b")?.get("c")).toBe(2);
  });

  it("creates undirected adjacency (both directions)", () => {
    const edges: GraphEdge[] = [{ from: "x", to: "y", weight: 3 }];
    const graph = buildGraph(edges);
    expect(graph.adjacencyList.get("x")?.get("y")).toBe(3);
    expect(graph.adjacencyList.get("y")?.get("x")).toBe(3);
  });
});

describe("detectCommunities", () => {
  it("returns empty array for empty edge list", () => {
    const result = detectCommunities([]);
    expect(result).toEqual([]);
  });

  it("returns one community for single node (self-loop)", () => {
    const edges: GraphEdge[] = [{ from: "a", to: "a", weight: 1 }];
    const result = detectCommunities(edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nodeId: "a", communityId: expect.any(Number) });
  });

  it("assigns every node to exactly one community", () => {
    const edges: GraphEdge[] = [
      { from: "a", to: "b", weight: 10 },
      { from: "b", to: "c", weight: 10 },
      { from: "a", to: "c", weight: 10 },
    ];
    const result = detectCommunities(edges, { randomSeed: 42 });
    expect(result).toHaveLength(3);
    const communityIds = [...new Set(result.map((r) => r.communityId))];
    expect(communityIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(result.map((r) => r.nodeId))).toEqual(
      new Set(["a", "b", "c"])
    );
  });

  it("splits two cliques into two communities when weakly connected", () => {
    const edges: GraphEdge[] = [
      { from: "a", to: "b", weight: 5 },
      { from: "b", to: "c", weight: 5 },
      { from: "a", to: "c", weight: 5 },
      { from: "x", to: "y", weight: 5 },
      { from: "y", to: "z", weight: 5 },
      { from: "x", to: "z", weight: 5 },
      { from: "c", to: "x", weight: 1 },
    ];
    const result = detectCommunities(edges, {
      randomSeed: 123,
      resolution: 1.0,
    });
    expect(result).toHaveLength(6); // 6 nodes: a,b,c,x,y,z
    const communityIds = [...new Set(result.map((r) => r.communityId))];
    expect(communityIds.length).toBe(2);
  });

  it("is deterministic with same randomSeed", () => {
    const edges: GraphEdge[] = [
      { from: "a", to: "b", weight: 1 },
      { from: "b", to: "c", weight: 1 },
      { from: "c", to: "d", weight: 1 },
      { from: "d", to: "a", weight: 1 },
    ];
    const run1 = detectCommunities(edges, { randomSeed: 999 });
    const run2 = detectCommunities(edges, { randomSeed: 999 });
    expect(run1.map((r) => `${r.nodeId}:${r.communityId}`).sort()).toEqual(
      run2.map((r) => `${r.nodeId}:${r.communityId}`).sort()
    );
  });
});

describe("leidenAlgorithm", () => {
  it("assigns each node to a community (no empty assignments)", () => {
    const edges: GraphEdge[] = [
      { from: "1", to: "2", weight: 1 },
      { from: "2", to: "3", weight: 1 },
    ];
    const graph = buildGraph(edges);
    const communities = leidenAlgorithm(graph, { randomSeed: 1 });
    expect(communities.size).toBe(3);
    for (const nodeId of graph.nodes.keys()) {
      expect(communities.has(nodeId)).toBe(true);
      expect(typeof communities.get(nodeId)).toBe("number");
    }
  });

  it("respects resolution option", () => {
    const edges: GraphEdge[] = [
      { from: "a", to: "b", weight: 1 },
      { from: "b", to: "c", weight: 1 },
      { from: "c", to: "a", weight: 1 },
    ];
    const graph = buildGraph(edges);
    const lowRes = leidenAlgorithm(graph, { resolution: 0.5, randomSeed: 1 });
    const highRes = leidenAlgorithm(graph, { resolution: 2.0, randomSeed: 1 });
    expect(lowRes.size).toBe(3);
    expect(highRes.size).toBe(3);
    // With same seed, resolution can change partition
    const lowIds = [...new Set(lowRes.values())];
    const highIds = [...new Set(highRes.values())];
    expect(lowIds.length).toBeGreaterThanOrEqual(1);
    expect(highIds.length).toBeGreaterThanOrEqual(1);
  });
});
