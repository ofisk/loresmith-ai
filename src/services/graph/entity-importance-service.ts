import type { EntityDAO } from "@/dao/entity-dao";
import type { CommunityDAO } from "@/dao/community-dao";
import type { EntityImportanceDAO } from "@/dao/entity-importance-dao";
import {
  mapOverrideToScore,
  type ImportanceLevel,
} from "@/lib/importance-config";

interface GraphNode {
  id: string;
  neighbors: Set<string>;
  inDegree: number;
  outDegree: number;
}

interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Array<{ from: string; to: string; weight: number }>;
}

export class EntityImportanceService {
  constructor(
    private readonly entityDAO: EntityDAO,
    private readonly communityDAO?: CommunityDAO,
    private readonly importanceDAO?: EntityImportanceDAO
  ) {}

  async calculatePageRank(
    campaignId: string,
    includeStaging = true
  ): Promise<Map<string, number>> {
    const graph = await this.buildGraph(campaignId, includeStaging);
    const scores = new Map<string, number>();

    if (graph.nodes.size === 0) {
      console.log(
        `[EntityImportance] PageRank: Empty graph for campaign ${campaignId}, skipping`
      );
      return scores;
    }

    console.log(
      `[EntityImportance] PageRank: Calculating for ${graph.nodes.size} nodes, ${graph.edges.length} edges`
    );

    const dampingFactor = 0.85;
    const maxIterations = 100;
    const tolerance = 0.0001;

    const nodeIds = Array.from(graph.nodes.keys());
    const numNodes = nodeIds.length;

    // Initialize all nodes with equal probability (1/n)
    for (const id of nodeIds) {
      scores.set(id, 1.0 / numNodes);
    }

    // Iterative PageRank algorithm: repeatedly update scores until convergence
    // Each iteration redistributes importance based on incoming links
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const newScores = new Map<string, number>();
      let maxDiff = 0;

      // Calculate new PageRank score for each node
      // A node's importance comes from nodes that link to it
      for (const nodeId of nodeIds) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        // Sum contributions from all neighbors (nodes that link to this node)
        // Each neighbor contributes its score divided by its out-degree
        // This distributes the neighbor's importance proportionally to its outgoing links
        let sum = 0;
        for (const neighborId of node.neighbors) {
          const neighbor = graph.nodes.get(neighborId);
          if (!neighbor || neighbor.outDegree === 0) continue;

          const oldScore = scores.get(neighborId) ?? 0;
          sum += oldScore / neighbor.outDegree;
        }

        // PageRank formula: (1-d)/n + d * sum of neighbor contributions
        // The (1-d)/n term ensures all nodes have a minimum importance
        // The damping factor (d) controls how much weight to give to link structure vs. uniform distribution
        const newScore = (1 - dampingFactor) / numNodes + dampingFactor * sum;
        newScores.set(nodeId, newScore);

        // Track the maximum change to detect convergence
        const oldScore = scores.get(nodeId) ?? 0;
        maxDiff = Math.max(maxDiff, Math.abs(newScore - oldScore));
      }

      // Update scores for next iteration
      scores.clear();
      for (const [id, score] of newScores) {
        scores.set(id, score);
      }

      // Stop early if scores have converged (changes are below tolerance)
      if (maxDiff < tolerance) {
        console.log(
          `[EntityImportance] PageRank: Converged after ${iteration + 1} iterations (maxDiff: ${maxDiff.toFixed(6)})`
        );
        break;
      }
    }

    const normalized = this.normalizeScores(scores);
    console.log(
      `[EntityImportance] PageRank: Completed ${maxIterations} iterations, normalized ${normalized.size} scores`
    );
    return normalized;
  }

  /**
   * Calculate betweenness centrality for all entities.
   * Betweenness centrality measures how often a node lies on the shortest path
   * between other nodes. Nodes with high betweenness act as bridges/connectors
   * in the graph and are important for information flow.
   */
  async calculateBetweennessCentrality(
    campaignId: string,
    includeStaging = true
  ): Promise<Map<string, number>> {
    const graph = await this.buildGraph(campaignId, includeStaging);
    const scores = new Map<string, number>();

    if (graph.nodes.size === 0) {
      console.log(
        `[EntityImportance] Betweenness: Empty graph for campaign ${campaignId}, skipping`
      );
      return scores;
    }

    const nodeIds = Array.from(graph.nodes.keys());
    console.log(
      `[EntityImportance] Betweenness: Calculating for ${nodeIds.length} nodes`
    );

    // Initialize all nodes with zero betweenness score
    for (const id of nodeIds) {
      scores.set(id, 0);
    }

    // For each node as a source, calculate shortest paths to all other nodes
    // This implements Brandes' algorithm for efficient betweenness calculation
    for (const sourceId of nodeIds) {
      // Track shortest distances from source to each node
      const distances = new Map<string, number>();
      // Count number of shortest paths from source to each node
      const paths = new Map<string, number>();
      // Store predecessors (nodes that lead to each node on shortest paths)
      const predecessors = new Map<string, string[]>();

      // Breadth-first search starting from source
      const queue: string[] = [sourceId];
      distances.set(sourceId, 0);
      paths.set(sourceId, 1);

      // BFS: Explore graph level by level to find all shortest paths
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentDist = distances.get(currentId) ?? Infinity;

        const node = graph.nodes.get(currentId);
        if (!node) continue;

        // Examine all neighbors of current node
        for (const neighborId of node.neighbors) {
          const neighborDist = distances.get(neighborId);
          const newDist = currentDist + 1;

          // First time reaching this neighbor: found a shortest path
          if (neighborDist === undefined) {
            distances.set(neighborId, newDist);
            // Number of paths to neighbor = number of paths to current node
            paths.set(neighborId, paths.get(currentId) ?? 0);
            // Current node is a predecessor of neighbor
            predecessors.set(neighborId, [currentId]);
            queue.push(neighborId);
          } else if (newDist === neighborDist) {
            // Found another shortest path of same length
            // Add current node's path count to neighbor's path count
            const currentPaths = paths.get(currentId) ?? 0;
            paths.set(neighborId, (paths.get(neighborId) ?? 0) + currentPaths);
            // Add current node as another predecessor
            const preds = predecessors.get(neighborId) ?? [];
            preds.push(currentId);
            predecessors.set(neighborId, preds);
          }
        }
      }

      // Calculate dependency scores: how much each node contributes to
      // betweenness when source is the starting point
      const dependencies = new Map<string, number>();
      // Process nodes in reverse order of distance (furthest first)
      // This allows us to accumulate dependencies correctly
      const sortedNodes = Array.from(distances.keys()).sort(
        (a, b) => (distances.get(b) ?? 0) - (distances.get(a) ?? 0)
      );

      // Backward pass: accumulate dependencies from furthest nodes to source
      for (const nodeId of sortedNodes) {
        if (nodeId === sourceId) continue;

        // Get all predecessors (nodes that lead to this node on shortest paths)
        const preds = predecessors.get(nodeId) ?? [];
        const nodePaths = paths.get(nodeId) ?? 1;

        // Distribute this node's dependency to its predecessors
        // Proportionally based on how many shortest paths go through each predecessor
        for (const predId of preds) {
          const predPaths = paths.get(predId) ?? 1;
          // Dependency formula: (paths through predecessor / paths to node) * (1 + node's dependency)
          // This distributes the node's importance back to nodes that lead to it
          const dependency =
            (predPaths / nodePaths) * (1 + (dependencies.get(nodeId) ?? 0));
          dependencies.set(
            predId,
            (dependencies.get(predId) ?? 0) + dependency
          );
        }

        // Add this node's dependency to its betweenness score
        // (excluding the source node itself)
        if (nodeId !== sourceId) {
          scores.set(
            nodeId,
            (scores.get(nodeId) ?? 0) + (dependencies.get(nodeId) ?? 0)
          );
        }
      }
    }

    const normalized = this.normalizeScores(scores);
    console.log(
      `[EntityImportance] Betweenness: Completed for ${normalized.size} nodes`
    );
    return normalized;
  }

  async calculateHierarchyLevel(
    campaignId: string,
    entityId: string
  ): Promise<number> {
    if (!this.communityDAO) {
      return 50;
    }

    const communities = await this.communityDAO.findCommunitiesContainingEntity(
      campaignId,
      entityId
    );

    if (communities.length === 0) {
      return 50;
    }

    const maxLevel = Math.max(...communities.map((c) => c.level));
    const minLevel = Math.min(...communities.map((c) => c.level));
    const levelRange = maxLevel - minLevel;

    if (levelRange === 0) {
      return 50;
    }

    const avgLevel =
      communities.reduce((sum, c) => sum + c.level, 0) / communities.length;
    const normalizedLevel = ((avgLevel - minLevel) / levelRange) * 100;

    return Math.max(0, Math.min(100, normalizedLevel));
  }

  async calculateCombinedImportance(
    campaignId: string,
    entityId: string,
    includeStaging = true
  ): Promise<number> {
    const [pagerank, betweenness, hierarchy] = await Promise.all([
      this.calculatePageRank(campaignId, includeStaging),
      this.calculateBetweennessCentrality(campaignId, includeStaging),
      this.calculateHierarchyLevel(campaignId, entityId),
    ]);

    const pagerankScore = pagerank.get(entityId) ?? 0;
    const betweennessScore = betweenness.get(entityId) ?? 0;
    const hierarchyScore = hierarchy;

    const combined =
      pagerankScore * 0.4 + betweennessScore * 0.4 + hierarchyScore * 0.2;

    return Math.max(0, Math.min(100, combined));
  }

  async getEntityImportance(
    campaignId: string,
    entityId: string,
    includeStaging = true
  ): Promise<number> {
    const readStart = Date.now();
    const entity = await this.entityDAO.getEntityById(entityId);
    if (!entity || entity.campaignId !== campaignId) {
      return 50;
    }

    const metadata = (entity.metadata as Record<string, unknown>) || {};
    const override = metadata.importanceOverride as
      | ImportanceLevel
      | null
      | undefined;

    // Try to read from table first (if DAO is available)
    if (this.importanceDAO) {
      const tableReadStart = Date.now();
      const importance = await this.importanceDAO.getImportance(entityId);
      const tableReadTime = Date.now() - tableReadStart;

      if (importance) {
        const tableReadTotal = Date.now() - readStart;
        console.log(
          `[EntityImportance] Read from table in ${tableReadTime}ms (total: ${tableReadTotal}ms)`
        );

        if (override) {
          return mapOverrideToScore(override, importance.importanceScore);
        }
        return importance.importanceScore;
      }
    }

    // Fallback to metadata for backward compatibility
    if (override) {
      const metadataReadStart = Date.now();
      const currentScore =
        (metadata.importanceScore as number) ??
        (await this.calculateCombinedImportance(
          campaignId,
          entityId,
          includeStaging
        ));
      const metadataReadTime = Date.now() - metadataReadStart;
      console.log(
        `[EntityImportance] Read from metadata in ${metadataReadTime}ms (fallback)`
      );
      return mapOverrideToScore(override, currentScore);
    }

    if (typeof metadata.importanceScore === "number") {
      const metadataReadTime = Date.now() - readStart;
      console.log(
        `[EntityImportance] Read from metadata in ${metadataReadTime}ms (fallback)`
      );
      return metadata.importanceScore;
    }

    // Calculate and store (prefer table if available)
    const calculated = await this.calculateCombinedImportance(
      campaignId,
      entityId,
      includeStaging
    );

    if (this.importanceDAO) {
      const writeStart = Date.now();
      // Need to calculate individual components for table storage
      const [pagerank, betweenness, hierarchy] = await Promise.all([
        this.calculatePageRank(campaignId, includeStaging),
        this.calculateBetweennessCentrality(campaignId, includeStaging),
        this.calculateHierarchyLevel(campaignId, entityId),
      ]);

      await this.importanceDAO.upsertImportance({
        entityId,
        campaignId,
        pagerank: pagerank.get(entityId) ?? 0,
        betweennessCentrality: betweenness.get(entityId) ?? 0,
        hierarchyLevel: Math.round(hierarchy),
        importanceScore: calculated,
      });
      const writeTime = Date.now() - writeStart;
      console.log(`[EntityImportance] Wrote to table in ${writeTime}ms`);
    } else {
      // Fallback to metadata
      await this.entityDAO.updateEntity(entityId, {
        metadata: {
          ...metadata,
          importanceScore: calculated,
        },
      });
    }

    return calculated;
  }

  async recalculateImportanceForEntity(
    campaignId: string,
    entityId: string
  ): Promise<number> {
    const startTime = Date.now();
    const [pagerank, betweenness, hierarchy] = await Promise.all([
      this.calculatePageRank(campaignId, true),
      this.calculateBetweennessCentrality(campaignId, true),
      this.calculateHierarchyLevel(campaignId, entityId),
    ]);

    const pagerankScore = pagerank.get(entityId) ?? 0;
    const betweennessScore = betweenness.get(entityId) ?? 0;
    const hierarchyScore = hierarchy;

    const calculated =
      pagerankScore * 0.4 + betweennessScore * 0.4 + hierarchyScore * 0.2;
    const finalCalculated = Math.max(0, Math.min(100, calculated));

    const entity = await this.entityDAO.getEntityById(entityId);
    if (!entity) {
      return finalCalculated;
    }

    const metadata = (entity.metadata as Record<string, unknown>) || {};
    const override = metadata.importanceOverride as
      | ImportanceLevel
      | null
      | undefined;

    const finalScore = override
      ? mapOverrideToScore(override, finalCalculated)
      : finalCalculated;

    // Store in table if available, otherwise fallback to metadata
    if (this.importanceDAO) {
      const writeStart = Date.now();
      await this.importanceDAO.upsertImportance({
        entityId,
        campaignId,
        pagerank: pagerankScore,
        betweennessCentrality: betweennessScore,
        hierarchyLevel: Math.round(hierarchyScore),
        importanceScore: finalCalculated,
      });
      const writeTime = Date.now() - writeStart;
      const totalTime = Date.now() - startTime;
      console.log(
        `[EntityImportance] Recalculated for entity ${entityId}: ${totalTime}ms (write: ${writeTime}ms)`
      );
    } else {
      // Fallback to metadata
      await this.entityDAO.updateEntity(entityId, {
        metadata: {
          ...metadata,
          importanceScore: finalCalculated,
        },
      });
    }

    return finalScore;
  }

  async recalculateImportanceForCampaign(
    campaignId: string
  ): Promise<Map<string, number>> {
    const startTime = Date.now();
    console.log(
      `[EntityImportance] Starting batch importance calculation for campaign: ${campaignId}`
    );

    const graphCalcStart = Date.now();
    const [pagerank, betweenness] = await Promise.all([
      this.calculatePageRank(campaignId, true),
      this.calculateBetweennessCentrality(campaignId, true),
    ]);

    const graphCalcTime = Date.now() - graphCalcStart;
    console.log(
      `[EntityImportance] PageRank and Betweenness calculated in ${graphCalcTime}ms (${pagerank.size} entities)`
    );

    const entities = await this.entityDAO.listEntitiesByCampaign(campaignId);
    const results = new Map<string, number>();

    const hierarchyCalcStart = Date.now();
    const hierarchyPromises = entities.map((entity) =>
      this.calculateHierarchyLevel(campaignId, entity.id)
    );
    const hierarchyScores = await Promise.all(hierarchyPromises);
    const hierarchyCalcTime = Date.now() - hierarchyCalcStart;
    console.log(
      `[EntityImportance] Hierarchy levels calculated in ${hierarchyCalcTime}ms (${hierarchyScores.length} entities)`
    );

    const writeStart = Date.now();
    const writePromises: Promise<void>[] = [];

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const metadata = (entity.metadata as Record<string, unknown>) || {};
      const pagerankScore = pagerank.get(entity.id) ?? 0;
      const betweennessScore = betweenness.get(entity.id) ?? 0;
      const hierarchyScore = hierarchyScores[i];

      const calculated =
        pagerankScore * 0.4 + betweennessScore * 0.4 + hierarchyScore * 0.2;
      const finalScore = Math.max(0, Math.min(100, calculated));

      const override = metadata.importanceOverride as
        | ImportanceLevel
        | null
        | undefined;

      const importanceScore = override
        ? mapOverrideToScore(override, finalScore)
        : finalScore;

      results.set(entity.id, importanceScore);

      // Store in table if available, otherwise fallback to metadata
      if (this.importanceDAO) {
        writePromises.push(
          this.importanceDAO.upsertImportance({
            entityId: entity.id,
            campaignId,
            pagerank: pagerankScore,
            betweennessCentrality: betweennessScore,
            hierarchyLevel: Math.round(hierarchyScore),
            importanceScore: finalScore,
          })
        );
      } else {
        // Fallback to metadata
        writePromises.push(
          this.entityDAO.updateEntity(entity.id, {
            metadata: {
              ...metadata,
              importanceScore: finalScore,
            },
          })
        );
      }
    }

    await Promise.all(writePromises);
    const writeTime = Date.now() - writeStart;
    const totalTime = Date.now() - startTime;
    console.log(
      `[EntityImportance] Batch importance calculation completed for campaign ${campaignId}: ${results.size} entities processed in ${totalTime}ms (graph: ${graphCalcTime}ms, hierarchy: ${hierarchyCalcTime}ms, write: ${writeTime}ms)`
    );

    return results;
  }

  private async buildGraph(
    campaignId: string,
    includeStaging: boolean
  ): Promise<Graph> {
    const nodes = new Map<string, GraphNode>();
    const edges: Array<{ from: string; to: string; weight: number }> = [];

    const relationshipRecords =
      await this.entityDAO.getMinimalRelationshipsForCampaign(campaignId);

    const entityRecords =
      await this.entityDAO.getMinimalEntitiesForCampaign(campaignId);

    const rejectedEntityIds = new Set<string>();
    const rejectedRelationshipKeys = new Set<string>();

    for (const record of entityRecords) {
      try {
        const metadata = record.metadata
          ? (JSON.parse(record.metadata) as Record<string, unknown>)
          : {};
        const shardStatus = metadata.shardStatus;
        const ignored = metadata.ignored === true;
        const rejected = metadata.rejected === true;

        if (
          (!includeStaging && shardStatus === "staging") ||
          shardStatus === "rejected" ||
          ignored === true ||
          rejected === true
        ) {
          rejectedEntityIds.add(record.id);
        }
      } catch (_error) {
        console.warn(
          `[EntityImportance] Failed to parse entity metadata, including it`
        );
      }
    }

    for (const rel of relationshipRecords) {
      if (
        rejectedEntityIds.has(rel.fromEntityId) ||
        rejectedEntityIds.has(rel.toEntityId)
      ) {
        continue;
      }

      try {
        const relMetadata = rel.metadata
          ? (JSON.parse(rel.metadata) as Record<string, unknown>)
          : {};
        if (relMetadata.rejected === true || relMetadata.ignored === true) {
          rejectedRelationshipKeys.add(`${rel.fromEntityId}-${rel.toEntityId}`);
          continue;
        }

        const status = relMetadata.status as string | undefined;
        if (!includeStaging && status === "staging") {
          rejectedRelationshipKeys.add(`${rel.fromEntityId}-${rel.toEntityId}`);
          continue;
        }
      } catch (_error) {
        console.warn(
          `[EntityImportance] Failed to parse relationship metadata, including it`
        );
      }

      edges.push({
        from: rel.fromEntityId,
        to: rel.toEntityId,
        weight: rel.strength ?? 1.0,
      });

      if (!nodes.has(rel.fromEntityId)) {
        nodes.set(rel.fromEntityId, {
          id: rel.fromEntityId,
          neighbors: new Set(),
          inDegree: 0,
          outDegree: 0,
        });
      }

      if (!nodes.has(rel.toEntityId)) {
        nodes.set(rel.toEntityId, {
          id: rel.toEntityId,
          neighbors: new Set(),
          inDegree: 0,
          outDegree: 0,
        });
      }

      const fromNode = nodes.get(rel.fromEntityId)!;
      const toNode = nodes.get(rel.toEntityId)!;

      fromNode.neighbors.add(rel.toEntityId);
      fromNode.outDegree++;
      toNode.inDegree++;
    }

    return { nodes, edges };
  }

  private normalizeScores(scores: Map<string, number>): Map<string, number> {
    if (scores.size === 0) {
      return scores;
    }

    const values = Array.from(scores.values());
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) {
      for (const key of scores.keys()) {
        scores.set(key, 50);
      }
      return scores;
    }

    const normalized = new Map<string, number>();
    scores.forEach((value, key) => {
      const normalizedValue = ((value - min) / range) * 100;
      normalized.set(key, Math.max(0, Math.min(100, normalizedValue)));
    });

    return normalized;
  }
}
