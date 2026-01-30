# Leiden algorithm

## Purpose

The Leiden algorithm is used for **community detection** in the entity relationship graph. It groups entities into communities (clusters) of highly connected nodes, which supports:

- Graph visualization (showing entities by community)
- Community summaries (summarizing each cluster for RAG)
- Understanding how entities cluster (e.g., by location, faction, or plot)

Implementation lives in `src/lib/graph/leiden-algorithm.ts`.

## Parameters

- **resolution** (gamma, default `1.0`): Controls community size. Lower values tend to produce fewer, larger communities; higher values produce more, smaller communities. Typical range: 0.5–2.0.
- **randomSeed** (optional): When set, the algorithm is deterministic for the same graph and seed. Omitted, results can vary between runs.
- **maxIterations** (default `10`): Maximum iterations per level in the local moving phase.
- **minImprovement** (default `0.0001`): Minimum modularity improvement to continue to the next level; below this, the algorithm stops.

## When it runs

- **On demand** via the `detectCommunities` tool (campaign-context agent): users can trigger community detection with optional resolution and filters.
- **Downstream**: Community detection service and graph visualization routes use the same algorithm to build community-based views and summaries.

## Complexity and behavior

- **Per-level iteration**: Local moving and refinement run for each level until modularity improvement is below `minImprovement` or level limit (100) is reached.
- **Determinism**: With a fixed `randomSeed`, the same graph and options produce the same partition.
- **Edge cases**: Empty edge list returns no communities; a single node (e.g. self-loop) is one community; all nodes can end up in one community if the graph is strongly connected and resolution is low.

## Exports

- `buildGraph(edges)` – builds an undirected graph (nodes, edges, adjacency list, total weight) from edge list.
- `leidenAlgorithm(graph, options)` – returns a `Map<nodeId, communityId>`.
- `detectCommunities(edges, options)` – convenience: builds the graph and runs Leiden, returns `CommunityAssignment[]`.

Unit tests: `tests/lib/leiden-algorithm.test.ts`.
