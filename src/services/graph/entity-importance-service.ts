import type { Community, CommunityDAO } from "@/dao/community-dao";
import type { EntityDAO } from "@/dao/entity-dao";
import type { EntityImportanceDAO } from "@/dao/entity-importance-dao";
import {
	type ImportanceLevel,
	mapOverrideToScore,
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

interface IncrementalImportanceOptions {
	radius?: number;
	maxIncrementalNodes?: number;
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
			return scores;
		}

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
				break;
			}
		}

		const normalized = this.normalizeScores(scores);
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
			return scores;
		}

		const nodeIds = Array.from(graph.nodes.keys());

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
		return normalized;
	}

	async calculateHierarchyLevel(
		campaignId: string,
		entityId: string,
		communitiesMap?: Map<string, Community[]>
	): Promise<number> {
		if (!this.communityDAO) {
			return 50;
		}

		let communities: Community[];
		if (communitiesMap) {
			// Use pre-loaded communities map
			communities = communitiesMap.get(entityId) || [];
		} else {
			// Fallback to individual query (used when called outside batch context)
			communities = await this.communityDAO.findCommunitiesContainingEntity(
				campaignId,
				entityId
			);
		}

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

	/**
	 * Entity importance scoring combines three features (weights in parentheses):
	 * - PageRank (0.4): Incoming link structure; damping 0.85, max 100 iterations.
	 * - Betweenness centrality (0.4): Brandes algorithm; bridge/bottleneck nodes.
	 * - Hierarchy level (0.2): Normalized level within community hierarchy.
	 *
	 * Formula: combined = pagerank*0.4 + betweenness*0.4 + hierarchy*0.2
	 * All inputs normalized to [0, 100] before combination.
	 * User override (importanceOverride) can map scores to fixed values (high→90, medium→60, low→10).
	 */
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
			const importance = await this.importanceDAO.getImportance(entityId);

			if (importance) {
				if (override) {
					return mapOverrideToScore(override, importance.importanceScore);
				}
				return importance.importanceScore;
			}
		}

		// Fallback to metadata for backward compatibility
		if (override) {
			const currentScore =
				(metadata.importanceScore as number) ??
				(await this.calculateCombinedImportance(
					campaignId,
					entityId,
					includeStaging
				));
			return mapOverrideToScore(override, currentScore);
		}

		if (typeof metadata.importanceScore === "number") {
			return metadata.importanceScore;
		}

		// Calculate and store (prefer table if available)
		const calculated = await this.calculateCombinedImportance(
			campaignId,
			entityId,
			includeStaging
		);

		if (this.importanceDAO) {
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
			await this.importanceDAO.upsertImportance({
				entityId,
				campaignId,
				pagerank: pagerankScore,
				betweennessCentrality: betweennessScore,
				hierarchyLevel: Math.round(hierarchyScore),
				importanceScore: finalCalculated,
			});
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
		const [pagerank, betweenness] = await Promise.all([
			this.calculatePageRank(campaignId, true),
			this.calculateBetweennessCentrality(campaignId, true),
		]);

		const entities = await this.entityDAO.listEntitiesByCampaign(campaignId);
		const results = new Map<string, number>();

		// Load all communities once and build an in-memory map to avoid N database queries
		let communitiesMap: Map<string, Community[]> | undefined;
		if (this.communityDAO) {
			const allCommunities =
				await this.communityDAO.listCommunitiesByCampaign(campaignId);
			communitiesMap = new Map<string, Community[]>();
			for (const community of allCommunities) {
				for (const entityId of community.entityIds) {
					if (!communitiesMap.has(entityId)) {
						communitiesMap.set(entityId, []);
					}
					communitiesMap.get(entityId)!.push(community);
				}
			}
		}
		const hierarchyPromises = entities.map((entity) =>
			this.calculateHierarchyLevel(campaignId, entity.id, communitiesMap)
		);
		const hierarchyScores = await Promise.all(hierarchyPromises);

		// Prepare batch data
		const importanceInputs: Array<{
			entityId: string;
			campaignId: string;
			pagerank: number;
			betweennessCentrality: number;
			hierarchyLevel: number;
			importanceScore: number;
		}> = [];
		const metadataUpdates: Array<{
			entityId: string;
			metadata: Record<string, unknown>;
		}> = [];

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
				importanceInputs.push({
					entityId: entity.id,
					campaignId,
					pagerank: pagerankScore,
					betweennessCentrality: betweennessScore,
					hierarchyLevel: Math.round(hierarchyScore),
					importanceScore: finalScore,
				});
			} else {
				// Fallback to metadata
				metadataUpdates.push({
					entityId: entity.id,
					metadata: {
						...metadata,
						importanceScore: finalScore,
					},
				});
			}
		}

		// Batch write importance scores (single batch query instead of N queries)
		if (this.importanceDAO && importanceInputs.length > 0) {
			await this.importanceDAO.upsertImportanceBatch(importanceInputs);
		}

		// Fallback: update metadata individually if importanceDAO not available
		if (metadataUpdates.length > 0) {
			await Promise.all(
				metadataUpdates.map((update) =>
					this.entityDAO.updateEntity(update.entityId, {
						metadata: update.metadata,
					})
				)
			);
		}

		return results;
	}

	async recalculateImportanceIncremental(
		campaignId: string,
		seedEntityIds: string[],
		options: IncrementalImportanceOptions = {}
	): Promise<Map<string, number>> {
		if (seedEntityIds.length === 0) {
			return new Map();
		}
		const radius = Math.max(1, options.radius ?? 2);
		const maxIncrementalNodes = options.maxIncrementalNodes ?? 600;
		const fullGraph = await this.buildGraph(campaignId, true);
		if (fullGraph.nodes.size === 0) {
			return new Map();
		}

		const affected = new Set<string>(seedEntityIds);
		let frontier = new Set<string>(seedEntityIds);
		for (let depth = 0; depth < radius; depth++) {
			const next = new Set<string>();
			for (const entityId of frontier) {
				const node = fullGraph.nodes.get(entityId);
				if (!node) continue;
				for (const neighborId of node.neighbors) {
					if (!affected.has(neighborId)) {
						affected.add(neighborId);
						next.add(neighborId);
					}
				}
			}
			if (next.size === 0) break;
			frontier = next;
		}

		if (affected.size > maxIncrementalNodes) {
			return this.recalculateImportanceForCampaign(campaignId);
		}

		const subgraph = this.induceSubgraph(fullGraph, affected);
		if (subgraph.nodes.size === 0) {
			return new Map();
		}

		const previousScores = new Map<string, number>();
		if (this.importanceDAO) {
			const allExisting =
				await this.importanceDAO.getImportanceForCampaign(campaignId);
			for (const row of allExisting) {
				previousScores.set(row.entityId, row.pagerank);
			}
		}

		const pagerank = this.calculatePageRankOnGraph(subgraph, previousScores);
		const betweenness = this.calculateBetweennessOnGraph(subgraph);
		const entityIds = Array.from(subgraph.nodes.keys());

		let communitiesMap: Map<string, Community[]> | undefined;
		if (this.communityDAO) {
			const allCommunities =
				await this.communityDAO.listCommunitiesByCampaign(campaignId);
			communitiesMap = new Map<string, Community[]>();
			for (const community of allCommunities) {
				for (const entityId of community.entityIds) {
					if (!communitiesMap.has(entityId)) communitiesMap.set(entityId, []);
					communitiesMap.get(entityId)!.push(community);
				}
			}
		}

		const results = new Map<string, number>();
		const upserts: Array<{
			entityId: string;
			campaignId: string;
			pagerank: number;
			betweennessCentrality: number;
			hierarchyLevel: number;
			importanceScore: number;
		}> = [];
		for (const entityId of entityIds) {
			const hierarchy = await this.calculateHierarchyLevel(
				campaignId,
				entityId,
				communitiesMap
			);
			const pagerankScore = pagerank.get(entityId) ?? 0;
			const betweennessScore = betweenness.get(entityId) ?? 0;
			const finalScore = Math.max(
				0,
				Math.min(
					100,
					pagerankScore * 0.4 + betweennessScore * 0.4 + hierarchy * 0.2
				)
			);
			results.set(entityId, finalScore);
			upserts.push({
				entityId,
				campaignId,
				pagerank: pagerankScore,
				betweennessCentrality: betweennessScore,
				hierarchyLevel: Math.round(hierarchy),
				importanceScore: finalScore,
			});
		}

		if (this.importanceDAO && upserts.length > 0) {
			await this.importanceDAO.upsertImportanceBatch(upserts);
		}
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
			} catch (_error) {}
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
			} catch (_error) {}

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

	private induceSubgraph(graph: Graph, included: Set<string>): Graph {
		const nodes = new Map<string, GraphNode>();
		const edges: Array<{ from: string; to: string; weight: number }> = [];
		for (const entityId of included) {
			const node = graph.nodes.get(entityId);
			if (!node) continue;
			nodes.set(entityId, {
				id: entityId,
				neighbors: new Set(),
				inDegree: 0,
				outDegree: 0,
			});
		}
		for (const edge of graph.edges) {
			if (!included.has(edge.from) || !included.has(edge.to)) continue;
			edges.push(edge);
			const fromNode = nodes.get(edge.from);
			const toNode = nodes.get(edge.to);
			if (!fromNode || !toNode) continue;
			fromNode.neighbors.add(edge.to);
			fromNode.outDegree += 1;
			toNode.inDegree += 1;
		}
		return { nodes, edges };
	}

	private calculatePageRankOnGraph(
		graph: Graph,
		initialScores?: Map<string, number>
	): Map<string, number> {
		const scores = new Map<string, number>();
		const nodeIds = Array.from(graph.nodes.keys());
		if (nodeIds.length === 0) return scores;
		const defaultScore = 1 / nodeIds.length;
		for (const id of nodeIds) {
			scores.set(id, initialScores?.get(id) ?? defaultScore);
		}
		const dampingFactor = 0.85;
		const maxIterations = 40;
		const tolerance = 0.0001;
		for (let iteration = 0; iteration < maxIterations; iteration++) {
			const newScores = new Map<string, number>();
			let maxDiff = 0;
			for (const nodeId of nodeIds) {
				const node = graph.nodes.get(nodeId);
				if (!node) continue;
				let sum = 0;
				for (const neighborId of node.neighbors) {
					const neighbor = graph.nodes.get(neighborId);
					if (!neighbor || neighbor.outDegree === 0) continue;
					sum += (scores.get(neighborId) ?? 0) / neighbor.outDegree;
				}
				const newScore =
					(1 - dampingFactor) / nodeIds.length + dampingFactor * sum;
				newScores.set(nodeId, newScore);
				maxDiff = Math.max(
					maxDiff,
					Math.abs(newScore - (scores.get(nodeId) ?? 0))
				);
			}
			scores.clear();
			for (const [id, score] of newScores) scores.set(id, score);
			if (maxDiff < tolerance) break;
		}
		return this.normalizeScores(scores);
	}

	private calculateBetweennessOnGraph(graph: Graph): Map<string, number> {
		const scores = new Map<string, number>();
		const nodeIds = Array.from(graph.nodes.keys());
		for (const id of nodeIds) scores.set(id, 0);
		for (const sourceId of nodeIds) {
			const distances = new Map<string, number>();
			const paths = new Map<string, number>();
			const predecessors = new Map<string, string[]>();
			const queue: string[] = [sourceId];
			distances.set(sourceId, 0);
			paths.set(sourceId, 1);
			while (queue.length > 0) {
				const currentId = queue.shift()!;
				const currentDist = distances.get(currentId) ?? Infinity;
				const node = graph.nodes.get(currentId);
				if (!node) continue;
				for (const neighborId of node.neighbors) {
					const known = distances.get(neighborId);
					const nextDist = currentDist + 1;
					if (known === undefined) {
						distances.set(neighborId, nextDist);
						paths.set(neighborId, paths.get(currentId) ?? 0);
						predecessors.set(neighborId, [currentId]);
						queue.push(neighborId);
					} else if (known === nextDist) {
						paths.set(
							neighborId,
							(paths.get(neighborId) ?? 0) + (paths.get(currentId) ?? 0)
						);
						const preds = predecessors.get(neighborId) ?? [];
						preds.push(currentId);
						predecessors.set(neighborId, preds);
					}
				}
			}
			const dependencies = new Map<string, number>();
			const sorted = Array.from(distances.keys()).sort(
				(a, b) => (distances.get(b) ?? 0) - (distances.get(a) ?? 0)
			);
			for (const nodeId of sorted) {
				if (nodeId === sourceId) continue;
				const preds = predecessors.get(nodeId) ?? [];
				const nodePaths = paths.get(nodeId) ?? 1;
				for (const predId of preds) {
					const predPaths = paths.get(predId) ?? 1;
					const dependency =
						(predPaths / nodePaths) * (1 + (dependencies.get(nodeId) ?? 0));
					dependencies.set(
						predId,
						(dependencies.get(predId) ?? 0) + dependency
					);
				}
				scores.set(
					nodeId,
					(scores.get(nodeId) ?? 0) + (dependencies.get(nodeId) ?? 0)
				);
			}
		}
		return this.normalizeScores(scores);
	}
}
