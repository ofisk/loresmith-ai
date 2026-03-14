import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "@/app-constants";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { getDAOFactory } from "@/dao/dao-factory";
import { isEntityStub } from "@/lib/entity/entity-content-merge";
import { sanitizeEntityContentForPlayer } from "@/lib/entity/entity-content-sanitizer";
import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity/entity-types";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import type { PlanningContextService } from "@/services/rag/planning-context-service";
import { getPlanningServices } from "@/services/rag/rag-service-factory";
import {
	buildCacheKey,
	getCachedSearchResult,
	getCampaignCacheVersion,
	setCachedSearchResult,
} from "@/services/search/entity-search-cache-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	type ToolExecuteOptions,
} from "@/tools/utils";
import { parseQueryIntent } from "./search-tools-query-intent";

// Dynamically build entity types list for descriptions
const ENTITY_TYPES_LIST = STRUCTURED_ENTITY_TYPES.join(", ");

/**
 * Calculate name similarity between a query and an entity name.
 * Returns a score between 0.0 and 1.0, where 1.0 is an exact match.
 * Used to detect when users are asking about a specific named entity.
 *
 * Scoring rationale:
 * - 1.0: Exact match (same string after normalization)
 * - 0.8: Containment with prefix boost (longer starts with shorter; e.g. "The Dragon" vs "Dragon")
 * - 0.6: Containment without prefix boost
 * - 0.7: All words match, possibly different order
 * - 0.5: Some words match
 * - 0.0: No meaningful overlap
 *
 * We use string-based similarity rather than Levenshtein because TTRPG entity names
 * often share common words ("of", "the", "lord") that inflate edit-distance scores.
 */
export function calculateNameSimilarity(
	query: string,
	entityName: string
): number {
	// Normalize both strings: lowercase, trim, remove articles
	const normalize = (str: string): string => {
		return str
			.toLowerCase()
			.trim()
			.replace(/^(the|a|an)\s+/i, "") // Remove articles
			.replace(/\s+/g, " "); // Normalize whitespace
	};

	const normalizedQuery = normalize(query);
	const normalizedEntityName = normalize(entityName);

	// Exact match (after normalization)
	if (normalizedQuery === normalizedEntityName) {
		return 1.0;
	}

	// Check if entity name contains query or vice versa (partial match)
	if (
		normalizedEntityName.includes(normalizedQuery) ||
		normalizedQuery.includes(normalizedEntityName)
	) {
		// Boost if the longer string starts with the shorter string (better match)
		const shorter =
			normalizedQuery.length < normalizedEntityName.length
				? normalizedQuery
				: normalizedEntityName;
		const longer =
			normalizedQuery.length >= normalizedEntityName.length
				? normalizedQuery
				: normalizedEntityName;
		if (longer.startsWith(shorter)) {
			return 0.8;
		}
		return 0.6;
	}

	// Check for word-level matches (e.g., "entity name" vs "Entity Name")
	const queryWords = normalizedQuery.split(/\s+/);
	const entityWords = normalizedEntityName.split(/\s+/);
	const matchingWords = queryWords.filter((word) => entityWords.includes(word));
	if (
		matchingWords.length > 0 &&
		matchingWords.length === Math.min(queryWords.length, entityWords.length)
	) {
		// All words match (possibly in different order)
		return 0.7;
	}
	if (matchingWords.length > 0) {
		// Some words match
		return 0.5;
	}

	// No meaningful match
	return 0.0;
}

const searchCampaignContextSchema = z.object({
	campaignId: commonSchemas.campaignId.describe(
		"Campaign ID (UUID). Auto-injected from user's selection. Never use entity/location names."
	),
	query: z
		.string()
		.describe(
			`Search query: entity names, topics, entity types (${ENTITY_TYPES_LIST}). Map synonyms: beasts/creatures→monsters, people/characters→npcs. "fire monsters"=monsters matching fire. "context:" prefix searches session digests.`
		),
	searchOriginalFiles: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"When true, search original uploaded files (PDFs, text) for matching content. Use when user asks to search source documents."
		),
	traverseFromEntityIds: z
		.array(z.string())
		.optional()
		.describe(
			"Entity IDs to start graph traversal. Use after initial search to explore connected entities."
		),
	traverseDepth: z
		.number()
		.int()
		.min(1)
		.max(3)
		.optional()
		.describe(
			"Traversal depth (default 1). Use 1 first, increase only if needed."
		),
	traverseRelationshipTypes: z
		.array(z.string())
		.optional()
		.describe(
			"Filter relationship types to traverse (e.g. ['resides_in', 'located_in'])."
		),
	includeTraversedEntities: z
		.boolean()
		.optional()
		.default(true)
		.describe("Include traversed entities in results (default true)."),
	offset: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(0)
		.describe("Pagination offset (default 0)."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.default(15)
		.describe("Max results to return (default 15, max 50)."),
	forSessionReadout: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"When true, for session plan readout: return all relevant entities, include full text."
		),
	jwt: commonSchemas.jwt,
});

export const searchCampaignContext = tool({
	description: `Search campaign context via semantic search and graph traversal. Use FIRST for entities "from my campaign" or "in my world" - retrieves APPROVED entities. Never use searchExternalResources for campaign entities.

Call ONCE: Map synonyms (e.g., "monsters or beasts") to correct entity type. Entity types: ${ENTITY_TYPES_LIST}. Map: beasts/creatures→monsters, people/characters→npcs. For "list all", use listAllEntities. "fire monsters"=monsters matching fire. "context:" prefix searches session digests. Graph: start traverseDepth=1. "X within Y": search parent first, then use traverseFromEntityIds. Use ONLY explicit relationships in results.`,
	inputSchema: searchCampaignContextSchema,
	execute: async (
		input: z.infer<typeof searchCampaignContextSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			query,
			traverseFromEntityIds,
			traverseDepth = 1,
			traverseRelationshipTypes,
			includeTraversedEntities = true,
			offset = 0,
			limit = 15,
			searchOriginalFiles = false,
			forSessionReadout = false,
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		const queryIntent = parseQueryIntent(query);

		try {
			const env = getEnvFromContext(options);

			// If we have environment, use semantic search
			if (env) {
				const access = await requireCampaignAccessForTool({
					env,
					campaignId,
					jwt,
					toolCallId,
				});
				if ("toolCallId" in access) {
					const errorCode = (
						access.result?.data as { errorCode?: number } | undefined
					)?.errorCode;
					if (errorCode === 404) {
						return createToolError(
							"Campaign not found",
							"Campaign not found",
							404,
							toolCallId
						);
					}
					if (errorCode === 401) {
						return createToolError(
							"Invalid authentication token",
							"Authentication failed",
							AUTH_CODES.INVALID_KEY,
							toolCallId
						);
					}
					return access;
				}
				const { userId } = access;

				// Declare name similarity tracking variables at function scope
				// so they're accessible when filtering results later
				const entityNameSimilarityScores = new Map<string, number>();
				let hasStrongNameMatches = false;
				const nameMatchThreshold = 0.6;

				// Verify campaign exists and belongs to user using DAO
				const campaignDAO = getDAOFactory(env).campaignDAO;

				const role = await campaignDAO.getCampaignRole(campaignId, userId);
				const shouldSanitizeForPlayer = role && PLAYER_ROLES.has(role);

				const results: any[] = [];
				const daoFactory = getDAOFactory(env);
				const requiresPlanningContext = queryIntent.searchPlanningContext;
				let planningService: PlanningContextService | null = null;
				let totalCount: number | undefined;
				// For list-all queries, use a high limit (500) to minimize pagination calls
				// For regular search queries, use the provided limit (default: 15, max: 50)
				const effectiveLimit = queryIntent.isListAll ? 500 : limit;

				// Helper function to extract file keys from entity metadata
				const extractFileKeysFromEntities = (
					entities: Awaited<
						ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
					>
				): Set<string> => {
					const fileKeys = new Set<string>();
					for (const entity of entities) {
						try {
							if (entity.metadata) {
								const metadata =
									typeof entity.metadata === "string"
										? (JSON.parse(entity.metadata) as Record<string, unknown>)
										: (entity.metadata as Record<string, unknown>);

								// Check for fileKey in metadata (direct or nested)
								if (metadata.fileKey && typeof metadata.fileKey === "string") {
									fileKeys.add(metadata.fileKey);
								}

								// Check for fileKey in sourceRef
								if (
									metadata.sourceRef &&
									typeof metadata.sourceRef === "object" &&
									metadata.sourceRef !== null
								) {
									const sourceRef = metadata.sourceRef as Record<
										string,
										unknown
									>;
									if (
										sourceRef.fileKey &&
										typeof sourceRef.fileKey === "string"
									) {
										fileKeys.add(sourceRef.fileKey);
									}
								}
							}
						} catch (_error) {}
					}
					return fileKeys;
				};

				const { planningContext, openaiApiKey } = await getPlanningServices(
					env as any
				);
				if (requiresPlanningContext && !openaiApiKey) {
					return createToolError(
						"OpenAI API key not configured",
						"AI is not configured for this environment.",
						503,
						toolCallId
					);
				}

				if (openaiApiKey) {
					planningService = planningContext;
					if (!planningService && requiresPlanningContext) {
						return createToolError(
							"Failed to initialize PlanningContextService",
							"Planning context dependencies not configured",
							500,
							toolCallId
						);
					}
				}

				// Primary search: Use PlanningContextService for semantic search of session digests and changelog
				// This searches through session recaps, planning notes, key events, and world state changes
				// Note: Session digests are temporary and get parsed into entities, so this is optional
				if (
					requiresPlanningContext &&
					planningService &&
					queryIntent.searchQuery.length > 0
				) {
					const planningResults = await planningService.search({
						campaignId,
						query: queryIntent.searchQuery,
						limit: 10,
						applyRecencyWeighting: true,
						forPlayer: shouldSanitizeForPlayer === true,
					});

					// For players, forPlayer restricts to player-safe sections only; for GMs include all
					for (const result of planningResults) {
						results.push({
							type: "planning_context",
							source: "session_digest",
							sessionNumber: result.sessionNumber,
							sessionDate: result.sessionDate,
							sectionType: result.sectionType,
							title: `Session ${result.sessionNumber} - ${result.sectionType}`,
							text: result.sectionContent,
							score: result.recencyWeightedScore,
							similarityScore: result.similarityScore,
							digestId: result.digestId,
							relatedEntities: result.relatedEntities,
							filename: `session-${result.sessionNumber}`,
						});
					}
				}

				// Secondary search: Entity search (${ENTITY_TYPES_LIST})
				// Always search entities unless query explicitly requests planning context only
				if (!requiresPlanningContext || queryIntent.entityType) {
					try {
						let entities: Awaited<
							ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
						> = [];

						const targetEntityType = queryIntent.entityType;

						// Map to store semantic similarity scores for entities
						const entitySimilarityScores = new Map<string, number>();

						// SEMANTIC RELEVANCY IS THE DEFAULT: Always use semantic search when we have a query
						// This applies to both focused searches and list-all queries
						const hasSearchQuery =
							queryIntent.searchQuery &&
							queryIntent.searchQuery.trim().length > 0;
						const shouldUseSemanticSearch =
							hasSearchQuery && planningService !== null && env.VECTORIZE;

						if (shouldUseSemanticSearch && planningService) {
							// For list-all queries, use a higher topK; for focused searches, use a more targeted topK
							const searchTopK = queryIntent.isListAll
								? Math.min(effectiveLimit * 2, 500)
								: targetEntityType
									? 20
									: 10;
							const normalizedQuery =
								queryIntent.searchQuery?.toLowerCase().trim() ?? "";

							// Try cache first (avoids embedding + Vectorize call)
							let cacheHit = false;
							if (env.DB) {
								try {
									const cacheVersion = await getCampaignCacheVersion(
										env.DB as D1Database,
										campaignId
									);
									const cacheKey = buildCacheKey(
										campaignId,
										cacheVersion,
										normalizedQuery,
										targetEntityType ?? undefined,
										searchTopK
									);
									const cached = await getCachedSearchResult(cacheKey);
									if (cached && cached.entityIds.length > 0) {
										cacheHit = true;
										for (let i = 0; i < cached.entityIds.length; i++) {
											entitySimilarityScores.set(
												cached.entityIds[i],
												cached.scores[i] ?? 0
											);
										}
										const entityIds = cached.entityIds;
										const fetchLimit = queryIntent.isListAll
											? effectiveLimit + 1
											: 100;
										entities =
											await daoFactory.entityDAO.listEntitiesByCampaign(
												campaignId,
												{
													limit: fetchLimit,
													entityType: targetEntityType || undefined,
													entityIds,
												}
											);
										if (queryIntent.isListAll && totalCount === undefined) {
											totalCount =
												await daoFactory.entityDAO.getEntityCountByCampaign(
													campaignId,
													targetEntityType
														? { entityType: targetEntityType }
														: {}
												);
										}
									}
								} catch (_cacheErr) {}
							}

							if (!cacheHit) {
								// Use semantic search (embedding + Vectorize)
								try {
									const queryEmbeddings =
										await planningService.generateEmbeddings([
											queryIntent.searchQuery,
										]);
									const queryEmbedding = queryEmbeddings[0];

									if (queryEmbedding) {
										const entityEmbeddingService = new EntityEmbeddingService(
											env.VECTORIZE as VectorizeIndex | undefined
										);

										const similarEntities =
											await entityEmbeddingService.findSimilarByEmbedding(
												queryEmbedding,
												{
													campaignId,
													entityType: targetEntityType || undefined,
													topK: searchTopK,
												}
											);

										// Store similarity scores for later use in sorting
										for (const similar of similarEntities) {
											entitySimilarityScores.set(
												similar.entityId,
												similar.score
											);
										}

										// Cache result for next time
										if (env.DB && similarEntities.length > 0) {
											try {
												const cacheVersion = await getCampaignCacheVersion(
													env.DB as D1Database,
													campaignId
												);
												const cacheKey = buildCacheKey(
													campaignId,
													cacheVersion,
													normalizedQuery,
													targetEntityType ?? undefined,
													searchTopK
												);
												await setCachedSearchResult(cacheKey, {
													entityIds: similarEntities.map((e) => e.entityId),
													scores: similarEntities.map((e) => e.score),
												});
											} catch {
												// ignore cache write failures
											}
										}

										// Get full entity details for semantic matches
										const entityIds = similarEntities.map((e) => e.entityId);
										if (entityIds.length > 0) {
											// For list-all, we might need to fetch more entities to fill the limit
											const fetchLimit = queryIntent.isListAll
												? effectiveLimit + 1
												: 100;
											entities =
												await daoFactory.entityDAO.listEntitiesByCampaign(
													campaignId,
													{
														limit: fetchLimit,
														entityType: targetEntityType || undefined,
														entityIds,
													}
												);

											// For list-all queries, get total count for accurate reporting
											if (queryIntent.isListAll && totalCount === undefined) {
												totalCount =
													await daoFactory.entityDAO.getEntityCountByCampaign(
														campaignId,
														targetEntityType
															? { entityType: targetEntityType }
															: {}
													);
											}
										} else {
											throw new Error("No semantic matches found");
										}
									} else {
										throw new Error("Failed to generate embedding");
									}
								} catch (_searchError) {
									// Fall through to database query below
									entities = [];
								}
							}
						}

						// Fallback: If semantic search wasn't used or failed, fetch from database
						// This happens for true "list all" with no query, or if semantic search fails
						if (!shouldUseSemanticSearch || entities.length === 0) {
							if (queryIntent.isListAll) {
								// List all entities of the requested type (or all entities if no type specified)
								// Use high limit (500) for list-all queries to minimize pagination calls
								// Request limit+1 to check if there are more results
								const queryLimit = effectiveLimit + 1;

								// Get total count for accurate reporting (only for list-all queries)
								totalCount =
									await daoFactory.entityDAO.getEntityCountByCampaign(
										campaignId,
										targetEntityType ? { entityType: targetEntityType } : {}
									);

								if (targetEntityType) {
									entities = await daoFactory.entityDAO.listEntitiesByCampaign(
										campaignId,
										{
											entityType: targetEntityType,
											limit: queryLimit,
											offset,
										}
									);
								} else {
									// No entity type specified, list all entities
									entities = await daoFactory.entityDAO.listEntitiesByCampaign(
										campaignId,
										{ limit: queryLimit, offset }
									);
								}
							} else if (
								queryIntent.searchQuery &&
								queryIntent.searchQuery.trim().length > 0
							) {
								// Fallback: If semantic search wasn't available or failed, try alternative methods
								// This should rarely happen since semantic search is now the default
								try {
									if (planningService) {
										const queryEmbeddings =
											await planningService.generateEmbeddings([
												queryIntent.searchQuery,
											]);
										const queryEmbedding = queryEmbeddings[0];

										if (queryEmbedding) {
											// Use PlanningContextService's findMatchingEntityIds as fallback
											const maxEntities = targetEntityType ? 500 : 25;
											const entityIds =
												await planningService.findMatchingEntityIds(
													campaignId,
													queryIntent.searchQuery,
													queryEmbedding,
													maxEntities
												);

											if (entityIds.length > 0) {
												// CRITICAL: Always filter by entityType if specified
												entities =
													await daoFactory.entityDAO.listEntitiesByCampaign(
														campaignId,
														{
															limit: 100,
															entityType: targetEntityType || undefined,
															entityIds,
														}
													);
											}
										}
									}
								} catch (_planningError) {}

								// Final fallback: keyword search if still no entities
								if (!entities || entities.length === 0) {
									const words = queryIntent.searchQuery
										.split(/\s+/)
										.filter((w) => w.length > 2);
									const keywordNames = [
										queryIntent.searchQuery.toLowerCase(),
										...words.map((w) => w.toLowerCase()),
									].slice(0, 10);

									entities = await daoFactory.entityDAO.searchEntitiesByName(
										campaignId,
										keywordNames,
										{
											entityType: targetEntityType || undefined,
											limit: targetEntityType ? 50 : 25,
										}
									);
								}
							}

							// Filter by entityType if a specific entity type was detected
							if (targetEntityType && entities.length > 0) {
								entities = entities.filter(
									(e) => e.entityType === targetEntityType
								);
							}
						}

						// Merge lexical name matches so specific names (e.g. "Baron La Croix") are always
						// included when the user asks for them, even if semantic search returned a different
						// entity (e.g. "Baron Vargas Vallakovich") in top-K
						const searchQueryTrimmed = queryIntent.searchQuery?.trim();
						if (
							searchQueryTrimmed &&
							searchQueryTrimmed.length > 0 &&
							!queryIntent.isListAll
						) {
							try {
								const lexicalMatches =
									await daoFactory.entityDAO.searchEntitiesByText(
										campaignId,
										searchQueryTrimmed,
										{ fields: ["name"], limit: 30 }
									);
								const existingIds = new Set(entities.map((e) => e.id));
								let added = 0;
								for (const e of lexicalMatches) {
									if (!existingIds.has(e.id)) {
										entities.push(e);
										existingIds.add(e.id);
										added++;
									}
								}
								if (added > 0) {
								}
							} catch (_lexErr) {}
						}

						// Filter out rejected/ignored/stub entities
						const approvedEntities = entities.filter((entity) => {
							try {
								const metadata = entity.metadata
									? (JSON.parse(entity.metadata as string) as Record<
											string,
											unknown
										>)
									: {};
								const shardStatus = metadata.shardStatus;
								const ignored = metadata.ignored === true;
								const rejected = metadata.rejected === true;
								const stub = isEntityStub({ metadata });
								return (
									shardStatus !== "rejected" && !ignored && !rejected && !stub
								);
							} catch {
								return true; // Include if metadata parsing fails
							}
						});

						// Post-filter: Calculate name similarity scores for entities
						// This helps detect when users are asking about a specific named entity
						// Note: entityNameSimilarityScores and hasStrongNameMatches are declared at function scope
						if (
							queryIntent.searchQuery &&
							queryIntent.searchQuery.trim().length > 0
						) {
							for (const entity of approvedEntities) {
								const nameScore = calculateNameSimilarity(
									queryIntent.searchQuery,
									entity.name
								);
								if (nameScore > 0) {
									entityNameSimilarityScores.set(entity.id, nameScore);
									if (nameScore >= nameMatchThreshold) {
										hasStrongNameMatches = true;
									}
								}
							}

							// Boost semantic scores with name similarity scores
							// If an entity has both semantic and name scores, combine them (weighted)
							for (const [
								entityId,
								nameScore,
							] of entityNameSimilarityScores.entries()) {
								const existingSemanticScore =
									entitySimilarityScores.get(entityId);
								if (nameScore >= nameMatchThreshold) {
									// Strong name match: significantly boost the score
									// If semantic score exists, take the max; otherwise use name score * 0.9
									const boostedScore = existingSemanticScore
										? Math.max(existingSemanticScore, nameScore * 0.9)
										: nameScore * 0.9;
									entitySimilarityScores.set(entityId, boostedScore);
								} else if (nameScore > 0) {
									// Weak name match: slight boost
									const boostedScore = existingSemanticScore
										? existingSemanticScore * (1 + nameScore * 0.1)
										: nameScore * 0.7;
									entitySimilarityScores.set(entityId, boostedScore);
								}
							}

							if (hasStrongNameMatches) {
							}

							// Sort so exact/strong name matches come first; then by semantic score
							approvedEntities.sort((a, b) => {
								const nameA = entityNameSimilarityScores.get(a.id) ?? 0;
								const nameB = entityNameSimilarityScores.get(b.id) ?? 0;
								if (nameB !== nameA) return nameB - nameA;
								const semA = entitySimilarityScores.get(a.id) ?? 0;
								const semB = entitySimilarityScores.get(b.id) ?? 0;
								return semB - semA;
							});
						}

						// Community-based expansion: Use communities as a shortcut to find related entities
						// If we found entities, find their communities and include other entities from those communities
						// Skip or limit expansion if strong name matches were found (indicating a specific entity query)
						const communityExpandedEntityIds = new Set<string>(
							approvedEntities.map((e) => e.id)
						);
						if (
							approvedEntities.length > 0 &&
							approvedEntities.length < 50 &&
							!queryIntent.isListAll &&
							!hasStrongNameMatches // Skip community expansion when strong name matches exist
						) {
							try {
								const communityDAO = daoFactory.communityDAO;

								// Find communities for each found entity
								const communityIdsSet = new Set<string>();
								for (const entity of approvedEntities) {
									try {
										const communities =
											await communityDAO.findCommunitiesContainingEntity(
												campaignId,
												entity.id
											);
										for (const community of communities) {
											communityIdsSet.add(community.id);
										}
									} catch (_error) {}
								}

								// Get all entities from those communities
								if (communityIdsSet.size > 0) {
									const allCommunities =
										await communityDAO.listCommunitiesByCampaign(campaignId);
									const relevantCommunities = allCommunities.filter((c) =>
										communityIdsSet.has(c.id)
									);
									const candidateEntityIds = Array.from(
										new Set(
											relevantCommunities.flatMap(
												(community) => community.entityIds
											)
										)
									);
									const candidateEntities =
										candidateEntityIds.length > 0
											? await daoFactory.entityDAO.listEntitiesByCampaign(
													campaignId,
													{
														limit: 1000,
														entityIds: candidateEntityIds,
														excludeShardStatuses: ["rejected", "deleted"],
													}
												)
											: [];
									const allEntitiesMap = new Map(
										candidateEntities.map((e) => [e.id, e])
									);

									for (const community of relevantCommunities) {
										for (const entityId of community.entityIds) {
											// Only add entities that match the target entity type (if specified)
											const entity = allEntitiesMap.get(entityId);
											if (
												entity &&
												(!targetEntityType ||
													entity.entityType === targetEntityType)
											) {
												// Filter out rejected/ignored entities
												try {
													const metadata = entity.metadata
														? (JSON.parse(entity.metadata as string) as Record<
																string,
																unknown
															>)
														: {};
													const shardStatus = metadata.shardStatus;
													const ignored = metadata.ignored === true;
													const rejected = metadata.rejected === true;
													if (
														shardStatus !== "rejected" &&
														!ignored &&
														!rejected
													) {
														communityExpandedEntityIds.add(entityId);
													}
												} catch {
													// Include if metadata parsing fails
													communityExpandedEntityIds.add(entityId);
												}
											}
										}
									}

									const expandedCount =
										communityExpandedEntityIds.size - approvedEntities.length;
									if (expandedCount > 0) {
										// Fetch the expanded entities and merge with existing results
										const expandedEntities = Array.from(
											communityExpandedEntityIds
										)
											.map((id) => allEntitiesMap.get(id))
											.filter(
												(e): e is NonNullable<typeof e> => e !== undefined
											);

										// Preserve order: original entities first, then community-expanded entities
										// Use similarity scores if available, otherwise use entity names
										const entityIdSet = new Set(
											approvedEntities.map((e) => e.id)
										);
										const newEntities = expandedEntities.filter(
											(e) => !entityIdSet.has(e.id)
										);

										// Sort new entities by similarity score if available, otherwise by name
										newEntities.sort((a, b) => {
											const scoreA = entitySimilarityScores.get(a.id) ?? 0;
											const scoreB = entitySimilarityScores.get(b.id) ?? 0;
											if (scoreA !== scoreB) {
												return scoreB - scoreA; // Higher score first
											}
											return a.name.localeCompare(b.name);
										});

										// Limit community expansion to avoid overwhelming results
										// Add up to limit/2 additional entities from communities
										const maxExpansion = Math.max(5, Math.floor(limit / 2));
										const limitedNewEntities = newEntities.slice(
											0,
											maxExpansion
										);

										// Merge: original entities first (preserve their order), then community-expanded
										entities = [...approvedEntities, ...limitedNewEntities];
									} else {
										entities = approvedEntities;
									}
								} else {
									entities = approvedEntities;
								}
							} catch (_error) {
								// Continue with original entities if community expansion fails
								entities = approvedEntities;
							}
						} else {
							entities = approvedEntities;
						}

						// Fetch relationships for entities to help AI understand actual connections
						// Relationships are stored separately from entities, so we need to fetch them explicitly
						const graphService = daoFactory.entityGraphService;

						// Collect all relationship data first, then batch-fetch related entity names
						const entityRelationshipsMap = new Map<
							string,
							Awaited<ReturnType<typeof graphService.getRelationshipsForEntity>>
						>();
						const relatedEntityIds = new Set<string>();

						// Fetch relationships for all entities in parallel
						await Promise.all(
							approvedEntities.map(async (entity) => {
								try {
									const relationships =
										await graphService.getRelationshipsForEntity(
											campaignId,
											entity.id
										);
									entityRelationshipsMap.set(entity.id, relationships);
									// Collect all related entity IDs for batch lookup
									for (const rel of relationships) {
										const otherId =
											rel.fromEntityId === entity.id
												? rel.toEntityId
												: rel.fromEntityId;
										relatedEntityIds.add(otherId);
									}
								} catch (_error) {
									entityRelationshipsMap.set(entity.id, []);
								}
							})
						);

						// Batch-fetch all related entity names
						const relatedEntitiesMap = new Map<string, string>();
						if (relatedEntityIds.size > 0) {
							const relatedEntities =
								await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
									entityIds: Array.from(relatedEntityIds),
									limit: 1000,
								});
							for (const relatedEntity of relatedEntities) {
								if (relatedEntityIds.has(relatedEntity.id)) {
									relatedEntitiesMap.set(relatedEntity.id, relatedEntity.name);
								}
							}
						}

						// Get changelog overlay snapshot to include world state updates (e.g., faction alignment)
						let changelogOverlay: Awaited<
							ReturnType<WorldStateChangelogService["getOverlaySnapshot"]>
						> | null = null;
						let worldStateService: WorldStateChangelogService | null = null;
						try {
							if (env.DB) {
								worldStateService = new WorldStateChangelogService({
									db: env.DB,
								});
								changelogOverlay =
									await worldStateService.getOverlaySnapshot(campaignId);
							}
						} catch (_error) {
							// Continue without overlay if it fails
						}

						// Transform entities to match expected format, including relationships
						for (const entity of approvedEntities) {
							const relationships = entityRelationshipsMap.get(entity.id) || [];

							// Apply changelog overlay to include world state updates (e.g., faction alignment)
							let worldStateInfo = "";
							if (changelogOverlay && worldStateService) {
								const entityWithOverlay = worldStateService.applyEntityOverlay(
									entity,
									changelogOverlay
								);

								// Include world state metadata in the entity text so the agent can see it
								if (entityWithOverlay.worldState) {
									const ws = entityWithOverlay.worldState;
									if (ws.metadata && typeof ws.metadata === "object") {
										const metadataStr = JSON.stringify(ws.metadata);
										if (metadataStr !== "{}") {
											worldStateInfo = `\n\n═══════════════════════════════════════════════════════\n`;
											worldStateInfo += `WORLD STATE UPDATES (FROM CHANGELOG)\n`;
											worldStateInfo += `═══════════════════════════════════════════════════════\n`;
											worldStateInfo += `CRITICAL: This information overrides any conflicting information in the entity content above.\n\n`;
											worldStateInfo += `Metadata: ${metadataStr}\n`;
											if (ws.status) {
												worldStateInfo += `Status: ${ws.status}\n`;
											}
											if (ws.description) {
												worldStateInfo += `Description: ${ws.description}\n`;
											}
											worldStateInfo += `\n`;
										}
									}
								}
							}

							// Build relationship summary for the AI with entity names
							const relationshipSummary = relationships.map((rel) => {
								const otherEntityId =
									rel.fromEntityId === entity.id
										? rel.toEntityId
										: rel.fromEntityId;
								const direction =
									rel.fromEntityId === entity.id ? "outgoing" : "incoming";
								const otherEntityName =
									relatedEntitiesMap.get(otherEntityId) || otherEntityId;

								return {
									relationshipType: rel.relationshipType,
									direction,
									otherEntityId,
									otherEntityName,
								};
							});

							// Build explicit relationship summary text for clarity
							// Place it FIRST so AI sees relationships before entity content
							let relationshipHeader =
								"═══════════════════════════════════════════════════════\n";
							relationshipHeader +=
								"EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n";
							relationshipHeader +=
								"═══════════════════════════════════════════════════════\n";
							relationshipHeader +=
								"CRITICAL: Use ONLY these relationships. Do NOT infer relationships from the entity content text below.\n\n";

							if (relationshipSummary.length > 0) {
								// Group relationships by type for better readability
								const relationshipsByType = new Map<
									string,
									typeof relationshipSummary
								>();
								relationshipSummary.forEach((rel) => {
									if (!relationshipsByType.has(rel.relationshipType)) {
										relationshipsByType.set(rel.relationshipType, []);
									}
									relationshipsByType.get(rel.relationshipType)!.push(rel);
								});

								// List relationships grouped by type
								relationshipsByType.forEach((rels, relationshipType) => {
									relationshipHeader += `${relationshipType.toUpperCase()}:\n`;
									rels.forEach((rel) => {
										const verb =
											rel.direction === "outgoing"
												? `${entity.name} ${relationshipType}`
												: `${entity.name} is related via ${relationshipType} (incoming)`;
										relationshipHeader += `  ${verb} ${rel.otherEntityName}\n`;
									});
									relationshipHeader += "\n";
								});
							} else {
								relationshipHeader +=
									"NONE - This entity has no relationships in the entity graph.\n";
								relationshipHeader +=
									"Do NOT infer relationships from content text below. Any relationship mentions in content are NOT verified.\n\n";
							}

							relationshipHeader +=
								"═══════════════════════════════════════════════════════\n";
							relationshipHeader +=
								"ENTITY CONTENT (may contain unverified mentions):\n";
							relationshipHeader +=
								"═══════════════════════════════════════════════════════\n";

							// Use semantic similarity score if available, otherwise use default
							const semanticScore = entitySimilarityScores.get(entity.id);
							const finalScore =
								semanticScore !== undefined ? semanticScore : 0.8; // Default score for entity matches

							// Sanitize content for player roles (strip spoilers)
							const contentToSerialize =
								shouldSanitizeForPlayer &&
								entity.content &&
								typeof entity.content === "object" &&
								!Array.isArray(entity.content)
									? sanitizeEntityContentForPlayer(
											entity.content as Record<string, unknown>,
											entity.entityType
										)
									: entity.content;

							// Combine relationship header, entity content, and world state info
							const entityText =
								relationshipHeader +
								JSON.stringify(contentToSerialize) +
								worldStateInfo;

							results.push({
								type: "entity",
								source: "entity_graph",
								entityType: entity.entityType,
								title: entity.name,
								text: entityText,
								score: finalScore, // Use semantic relevancy score when available
								entityId: entity.id,
								filename: entity.name,
								relationships: relationshipSummary,
								relationshipCount: relationships.length,
							});
						}

						// If user requests original file search, search file chunks from entities' source files
						// Only search files that are referenced by the found entities - if entity extraction
						// didn't find the entity in a file, that file likely doesn't contain relevant information
						if (searchOriginalFiles && query.trim().length > 0) {
							try {
								// Extract file keys from found entities - these are the files that contain
								// information about the entities we found, so they're the most relevant to search
								const relevantFileKeys = Array.from(
									extractFileKeysFromEntities(approvedEntities)
								);

								if (relevantFileKeys.length > 0) {
									// Search file chunks for matching text (case-insensitive)
									const searchTermLower = query.toLowerCase();
									const maxFileResults = 50; // Limit total file search results to avoid token overflow
									let fileResultCount = 0;

									// Search chunks for each relevant file
									for (const fileKey of relevantFileKeys) {
										if (fileResultCount >= maxFileResults) {
											break; // Stop searching if we've hit the limit
										}

										try {
											// Get all chunks for this file
											const allChunks =
												await daoFactory.fileDAO.getFileChunks(fileKey);

											// Get file metadata for display name
											const fileMetadata =
												await daoFactory.fileDAO.getFileMetadata(fileKey);

											// Filter chunks that contain the search term (case-insensitive)
											const matchingChunks = allChunks.filter((chunk) =>
												chunk.chunk_text.toLowerCase().includes(searchTermLower)
											);

											// Limit to first 10 matches per file, and respect global limit
											const remainingSlots = maxFileResults - fileResultCount;
											const limitedChunks = matchingChunks.slice(
												0,
												Math.min(10, remainingSlots)
											);

											// Add matching chunks to results
											for (const chunk of limitedChunks) {
												results.push({
													type: "file_content",
													source: "original_file",
													fileKey: chunk.file_key,
													fileName:
														fileMetadata?.display_name ||
														fileMetadata?.file_name ||
														"Unknown file",
													chunkIndex: chunk.chunk_index,
													text: chunk.chunk_text,
													title: `${
														fileMetadata?.display_name ||
														fileMetadata?.file_name ||
														"Unknown file"
													} (chunk ${chunk.chunk_index + 1})`,
													score: 1.0, // Lexical match, all results are equally relevant
												});
												fileResultCount++;
											}
										} catch (_error) {}
									}
								} else {
								}
							} catch (_error) {
								// Don't fail the entire search if file search fails, just log and continue
							}
						}
					} catch (_error) {
						// Continue even if entity search fails
					}
				}

				// Graph traversal: If traverseFromEntityIds is provided, traverse the graph from those entities
				if (traverseFromEntityIds && traverseFromEntityIds.length > 0) {
					try {
						const daoFactory = getDAOFactory(env);
						const graphService = daoFactory.entityGraphService;

						// Normalize relationship types if provided
						const normalizedRelationshipTypes = traverseRelationshipTypes?.map(
							(type: string) => type.toLowerCase().replace(/\s+/g, "_")
						);

						// Collect all traversed neighbors from all starting entities
						const allTraversedNeighbors: Array<{
							neighbor: Awaited<
								ReturnType<typeof graphService.getNeighbors>
							>[number];
							sourceEntityId: string;
						}> = [];

						// Traverse from each starting entity ID
						for (const entityId of traverseFromEntityIds) {
							try {
								const neighbors = await graphService.getNeighbors(
									campaignId,
									entityId,
									{
										maxDepth: traverseDepth,
										relationshipTypes: normalizedRelationshipTypes as any,
									}
								);
								allTraversedNeighbors.push(
									...neighbors.map((neighbor) => ({
										neighbor,
										sourceEntityId: entityId,
									}))
								);
							} catch (_error) {}
						}

						// Deduplicate by entity ID (keep first occurrence)
						const traversedEntityIdsMap = new Map<
							string,
							{
								neighbor: Awaited<
									ReturnType<typeof graphService.getNeighbors>
								>[number];
								sourceEntityId: string;
							}
						>();
						for (const item of allTraversedNeighbors) {
							if (!traversedEntityIdsMap.has(item.neighbor.entityId)) {
								traversedEntityIdsMap.set(item.neighbor.entityId, item);
							}
						}

						const uniqueTraversedEntityIds = Array.from(
							traversedEntityIdsMap.keys()
						);

						if (
							includeTraversedEntities &&
							uniqueTraversedEntityIds.length > 0
						) {
							// Fetch full entity details for traversed entities
							const traversedEntities =
								await daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
									entityIds: uniqueTraversedEntityIds,
									limit: 1000,
									excludeShardStatuses: ["rejected", "deleted"],
								});

							// Filter out rejected/ignored/stub entities
							const approvedTraversedEntities = traversedEntities.filter(
								(entity) => {
									try {
										const metadata = entity.metadata
											? (JSON.parse(entity.metadata as string) as Record<
													string,
													unknown
												>)
											: {};
										const shardStatus = metadata.shardStatus;
										const ignored = metadata.ignored === true;
										const rejected = metadata.rejected === true;
										const stub = isEntityStub({ metadata });
										return (
											shardStatus !== "rejected" &&
											!ignored &&
											!rejected &&
											!stub
										);
									} catch {
										return true; // Include if metadata parsing fails
									}
								}
							);

							// Fetch relationships for traversed entities
							const traversedEntityRelationshipsMap = new Map<
								string,
								Awaited<
									ReturnType<typeof graphService.getRelationshipsForEntity>
								>
							>();
							const traversedRelatedEntityIds = new Set<string>();

							await Promise.all(
								approvedTraversedEntities.map(async (entity) => {
									try {
										const relationships =
											await graphService.getRelationshipsForEntity(
												campaignId,
												entity.id
											);
										traversedEntityRelationshipsMap.set(
											entity.id,
											relationships
										);
										for (const rel of relationships) {
											const otherId =
												rel.fromEntityId === entity.id
													? rel.toEntityId
													: rel.fromEntityId;
											traversedRelatedEntityIds.add(otherId);
										}
									} catch (_error) {
										traversedEntityRelationshipsMap.set(entity.id, []);
									}
								})
							);

							// Batch-fetch related entity names
							const traversedRelatedEntitiesMap = new Map<string, string>();
							if (traversedRelatedEntityIds.size > 0) {
								const allRelatedEntities =
									await daoFactory.entityDAO.listEntitiesByCampaign(
										campaignId,
										{
											limit: 1000,
											entityIds: Array.from(traversedRelatedEntityIds),
										}
									);
								for (const relatedEntity of allRelatedEntities) {
									if (traversedRelatedEntityIds.has(relatedEntity.id)) {
										traversedRelatedEntitiesMap.set(
											relatedEntity.id,
											relatedEntity.name
										);
									}
								}
							}

							// Get source entity names for context
							const sourceEntityMap = new Map<string, string>();
							if (traverseFromEntityIds.length > 0) {
								const allSourceEntities =
									await daoFactory.entityDAO.listEntitiesByCampaign(
										campaignId,
										{
											limit: 1000,
											entityIds: traverseFromEntityIds,
										}
									);
								for (const sourceEntity of allSourceEntities) {
									if (traverseFromEntityIds.includes(sourceEntity.id)) {
										sourceEntityMap.set(sourceEntity.id, sourceEntity.name);
									}
								}
							}

							// Transform traversed entities to match expected format
							for (const entity of approvedTraversedEntities) {
								const traversalInfo = traversedEntityIdsMap.get(entity.id);
								const relationships =
									traversedEntityRelationshipsMap.get(entity.id) || [];

								// Build relationship summary
								const relationshipSummary = relationships.map((rel) => {
									const otherEntityId =
										rel.fromEntityId === entity.id
											? rel.toEntityId
											: rel.fromEntityId;
									const direction =
										rel.fromEntityId === entity.id ? "outgoing" : "incoming";
									const otherEntityName =
										traversedRelatedEntitiesMap.get(otherEntityId) ||
										otherEntityId;

									return {
										relationshipType: rel.relationshipType,
										direction,
										otherEntityId,
										otherEntityName,
									};
								});

								// Build relationship header with traversal context
								const sourceEntityName = traversalInfo?.sourceEntityId
									? sourceEntityMap.get(traversalInfo.sourceEntityId) ||
										traversalInfo.sourceEntityId
									: "unknown";
								const depth = traversalInfo?.neighbor.depth || 1;

								let relationshipHeader =
									"═══════════════════════════════════════════════════════\n";
								relationshipHeader +=
									"EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n";
								relationshipHeader +=
									"═══════════════════════════════════════════════════════\n";
								relationshipHeader += `Found via graph traversal from "${sourceEntityName}" at depth ${depth}.\n`;
								relationshipHeader +=
									"CRITICAL: Use ONLY these relationships. Do NOT infer relationships from the entity content text below.\n\n";

								if (relationshipSummary.length > 0) {
									const relationshipsByType = new Map<
										string,
										typeof relationshipSummary
									>();
									relationshipSummary.forEach((rel) => {
										if (!relationshipsByType.has(rel.relationshipType)) {
											relationshipsByType.set(rel.relationshipType, []);
										}
										relationshipsByType.get(rel.relationshipType)!.push(rel);
									});

									relationshipsByType.forEach((rels, relationshipType) => {
										relationshipHeader += `${relationshipType.toUpperCase()}:\n`;
										rels.forEach((rel) => {
											const verb =
												rel.direction === "outgoing"
													? `${entity.name} ${relationshipType}`
													: `${entity.name} is related via ${relationshipType} (incoming)`;
											relationshipHeader += `  ${verb} ${rel.otherEntityName}\n`;
										});
										relationshipHeader += "\n";
									});
								} else {
									relationshipHeader +=
										"NONE - This entity has no relationships in the entity graph.\n";
									relationshipHeader +=
										"Do NOT infer relationships from content text below. Any relationship mentions in content are NOT verified.\n\n";
								}

								relationshipHeader +=
									"═══════════════════════════════════════════════════════\n";
								relationshipHeader +=
									"ENTITY CONTENT (may contain unverified mentions):\n";
								relationshipHeader +=
									"═══════════════════════════════════════════════════════\n";

								const traversedContentToSerialize =
									shouldSanitizeForPlayer &&
									entity.content &&
									typeof entity.content === "object" &&
									!Array.isArray(entity.content)
										? sanitizeEntityContentForPlayer(
												entity.content as Record<string, unknown>,
												entity.entityType
											)
										: entity.content;

								results.push({
									type: "entity",
									source: "graph_traversal",
									entityType: entity.entityType,
									title: entity.name,
									text:
										relationshipHeader +
										JSON.stringify(traversedContentToSerialize),
									score: 0.7 - depth * 0.1, // Lower score for deeper traversal
									entityId: entity.id,
									filename: entity.name,
									relationships: relationshipSummary,
									relationshipCount: relationships.length,
									// Add traversal metadata
									traversalDepth: depth,
									traversedFrom: sourceEntityName,
								} as any);
							}
						}
					} catch (_error) {
						// Continue even if traversal fails
					}
				}

				// Check if we have semantic scores (non-default scores indicate semantic relevancy was computed)
				// Default scores are 0.8 (entity matches), 0.7 (traversed entities), or 0 (no score)
				const hasSemanticScores = results.some((r) => {
					const score = r.score || 0;
					return score !== 0.8 && score !== 0.7 && score !== 0 && score !== 1.0;
				});

				// Filter results to prioritize strong name matches when they exist
				// This ensures queries like "tell me about [entity name]" focus on that specific entity
				// For session readout we keep all results so encounter-detail entities (e.g. Ambush Mistake Encounter) are not dropped
				// Note: entityNameSimilarityScores and hasStrongNameMatches are declared at function scope (line ~340)
				let finalResults = results;
				if (
					!forSessionReadout &&
					hasStrongNameMatches &&
					entityNameSimilarityScores.size > 0
				) {
					const nameMatchedResults = results.filter((result) => {
						const nameScore = entityNameSimilarityScores.get(
							result.entityId || ""
						);
						return nameScore !== undefined && nameScore >= nameMatchThreshold;
					});
					if (nameMatchedResults.length > 0) {
						finalResults = nameMatchedResults;
					}
				}

				// Sort results by semantic relevancy (highest score first)
				// All results should be sorted by relevancy to the query/prompt
				finalResults.sort((a, b) => {
					const scoreA = a.score || 0;
					const scoreB = b.score || 0;

					// Primary sort: by semantic relevancy score (highest first) if available
					if (hasSemanticScores && scoreB !== scoreA) {
						return scoreB - scoreA;
					}

					// If no semantic scores or scores are equal, sort alphabetically by name
					const nameA = (
						a.title ||
						a.name ||
						a.display_name ||
						a.id ||
						""
					).toLowerCase();
					const nameB = (
						b.title ||
						b.name ||
						b.display_name ||
						b.id ||
						""
					).toLowerCase();
					return nameA.localeCompare(nameB);
				});

				// Check if there are more results (for list-all queries, we requested limit+1)
				let hasMore = false;
				let actualResults = finalResults;
				const limitHit =
					queryIntent.isListAll && finalResults.length > effectiveLimit;

				if (limitHit) {
					hasMore = true;
					actualResults = finalResults.slice(0, effectiveLimit);
				} else if (
					!queryIntent.isListAll &&
					finalResults.length > effectiveLimit
				) {
					// For search queries, check if we hit the limit
					hasMore = true;
					actualResults = finalResults.slice(0, effectiveLimit);
				}

				// Note: totalCount is already fetched above for list-all queries

				const entityTypeLabel = queryIntent.entityType
					? ` (${queryIntent.entityType})`
					: "";

				// Build clear pagination message
				let paginationInfo = "";
				const sortInfo = hasSemanticScores
					? " Results are sorted from most to least relevant."
					: " Results are sorted alphabetically by name.";

				if (queryIntent.isListAll) {
					if (limitHit && totalCount !== undefined) {
						paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${totalCount} total shards. There are ${totalCount - actualResults.length} more shards not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
					} else if (totalCount !== undefined) {
						paginationInfo = ` (${totalCount} total)`;
					}
				} else {
					if (hasMore && totalCount !== undefined) {
						paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${totalCount} total results. There are ${totalCount - actualResults.length} more results not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
					} else if (hasMore) {
						paginationInfo = ` ⚠️ LIMIT REACHED: Showing ${actualResults.length} of ${finalResults.length}+ results. There are more results not shown. Use offset=${offset + effectiveLimit} to retrieve the next page.`;
					} else if (totalCount !== undefined) {
						paginationInfo = ` (${totalCount} total)`;
					}
				}

				const readoutReminder = forSessionReadout
					? " For session readout: include the full 'text' of each result in your reply; do not summarize."
					: "";
				return createToolSuccess(
					`Found ${totalCount !== undefined ? totalCount : actualResults.length} results for "${query}"${entityTypeLabel}.${sortInfo}${paginationInfo}${readoutReminder}`,
					{
						query,
						queryIntent,
						results: actualResults,
						totalCount,
						pagination: {
							offset,
							limit: effectiveLimit,
							hasMore,
							nextOffset: hasMore ? offset + effectiveLimit : undefined,
						},
					},
					toolCallId
				);
			}

			// Fallback: Environment not available, return error
			return createToolError(
				"Environment not available for campaign search",
				"Unable to access campaign data",
				500,
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to search campaign context",
				error,
				500,
				toolCallId
			);
		}
	},
});

// Re-export list and external search from split modules
export { listAllEntities } from "./list-all-entities-tool";
export { searchExternalResources } from "./search-external-resources-tool";
