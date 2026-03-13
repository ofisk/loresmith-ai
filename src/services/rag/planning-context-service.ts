import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity, EntityNeighbor } from "@/dao/entity-dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { PLANNING_CONTEXT_PROMPTS } from "@/lib/prompts/planning-context-prompts";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import type { SessionDigestWithData } from "@/types/session-digest";
import type { WorldStateChangelogEntry } from "@/types/world-state";
import { BaseRAGService } from "./base-rag-service";

/** Section types that are safe to show to players (no GM-only planning spoilers). */
export const PLAYER_SAFE_PLANNING_SECTION_TYPES = new Set([
	"key_events",
	"open_threads",
	"state_changes",
	"probable_player_goals",
]);

export interface PlanningContextSearchOptions {
	campaignId: string;
	query: string;
	limit?: number;
	fromDate?: string;
	toDate?: string;
	sectionTypes?: string[];
	applyRecencyWeighting?: boolean;
	decayRate?: number;
	/** When true, only return player-safe section types (no GM planning spoilers). */
	forPlayer?: boolean;
}

export interface PlanningContextSearchResult {
	digestId: string;
	sessionNumber: number;
	sessionDate: string | null;
	sectionType: string;
	sectionContent: string;
	similarityScore: number;
	recencyWeightedScore: number;
	digest: SessionDigestWithData;
	relatedEntities?: EntityGraphContext[];
}

export interface EntityGraphContext {
	entityId: string;
	entityName: string;
	entityType: string;
	neighbors: EntityNeighbor[];
	matchedKeywords: string[];
}

export interface IndexedSection {
	id: string;
	digestId: string;
	campaignId: string;
	sessionNumber: number;
	sessionDate: string | null;
	sectionType: string;
	content: string;
	embedding: number[];
}

export class PlanningContextService extends BaseRAGService {
	private readonly defaultDecayRate = 0.1;

	private static entityNamesCache = new Map<
		string,
		{ names: string[]; expiresAt: number }
	>();
	private readonly entityNamesCacheTTL = 5 * 60 * 1000; // 5 minutes

	private buildEntityNamesCacheKey(campaignId: string, query: string): string {
		const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
		const queryHash = this.simpleHash(normalized);
		return `entity-names:${campaignId}:${queryHash}`;
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * Extract indexable sections from a session digest
	 */
	private extractDigestSections(digest: SessionDigestWithData): Array<{
		sectionType: string;
		content: string;
	}> {
		const sections: Array<{ sectionType: string; content: string }> = [];

		const { digestData } = digest;

		if (digestData.last_session_recap) {
			if (digestData.last_session_recap.key_events.length > 0) {
				sections.push({
					sectionType: "key_events",
					content: digestData.last_session_recap.key_events.join(". "),
				});
			}

			if (digestData.last_session_recap.open_threads.length > 0) {
				sections.push({
					sectionType: "open_threads",
					content: digestData.last_session_recap.open_threads.join(". "),
				});
			}

			if (digestData.last_session_recap.state_changes) {
				const stateChanges = digestData.last_session_recap.state_changes;
				const stateChangeParts: string[] = [];
				if (stateChanges.factions.length > 0) {
					stateChangeParts.push(
						`Factions: ${stateChanges.factions.join(", ")}`
					);
				}
				if (stateChanges.locations.length > 0) {
					stateChangeParts.push(
						`Locations: ${stateChanges.locations.join(", ")}`
					);
				}
				if (stateChanges.npcs.length > 0) {
					stateChangeParts.push(`NPCs: ${stateChanges.npcs.join(", ")}`);
				}
				if (stateChangeParts.length > 0) {
					sections.push({
						sectionType: "state_changes",
						content: stateChangeParts.join(". "),
					});
				}
			}
		}

		if (digestData.next_session_plan) {
			if (digestData.next_session_plan.objectives_dm.length > 0) {
				sections.push({
					sectionType: "objectives_dm",
					content: digestData.next_session_plan.objectives_dm.join(". "),
				});
			}

			if (digestData.next_session_plan.probable_player_goals.length > 0) {
				sections.push({
					sectionType: "probable_player_goals",
					content:
						digestData.next_session_plan.probable_player_goals.join(". "),
				});
			}

			if (digestData.next_session_plan.beats.length > 0) {
				sections.push({
					sectionType: "beats",
					content: digestData.next_session_plan.beats.join(". "),
				});
			}

			if (digestData.next_session_plan.if_then_branches.length > 0) {
				sections.push({
					sectionType: "if_then_branches",
					content: digestData.next_session_plan.if_then_branches.join(". "),
				});
			}
		}

		if (digestData.npcs_to_run.length > 0) {
			sections.push({
				sectionType: "npcs_to_run",
				content: digestData.npcs_to_run.join(", "),
			});
		}

		if (digestData.locations_in_focus.length > 0) {
			sections.push({
				sectionType: "locations_in_focus",
				content: digestData.locations_in_focus.join(", "),
			});
		}

		if (digestData.encounter_seeds.length > 0) {
			sections.push({
				sectionType: "encounter_seeds",
				content: digestData.encounter_seeds.join(". "),
			});
		}

		if (digestData.clues_and_revelations.length > 0) {
			sections.push({
				sectionType: "clues_and_revelations",
				content: digestData.clues_and_revelations.join(". "),
			});
		}

		if (digestData.treasure_and_rewards.length > 0) {
			sections.push({
				sectionType: "treasure_and_rewards",
				content: digestData.treasure_and_rewards.join(", "),
			});
		}

		if (digestData.todo_checklist.length > 0) {
			sections.push({
				sectionType: "todo_checklist",
				content: digestData.todo_checklist.join(". "),
			});
		}

		return sections;
	}

	/**
	 * Index a session digest by embedding its sections into Vectorize
	 */
	async indexSessionDigest(digest: SessionDigestWithData): Promise<void> {
		try {
			this.validateDependencies();

			const sections = this.extractDigestSections(digest);
			if (sections.length === 0) {
				return;
			}

			const texts = sections.map((s) => s.content);
			const embeddings = await this.generateEmbeddings(texts);

			const vectors = sections.map((section, index) => {
				const sectionId = `${digest.id}_${section.sectionType}`;
				return {
					id: sectionId,
					values: embeddings[index],
					metadata: {
						digestId: digest.id,
						campaignId: digest.campaignId,
						sessionNumber: digest.sessionNumber,
						sessionDate: digest.sessionDate || "",
						sectionType: section.sectionType,
						contentType: "session_digest",
					},
				};
			});

			await this.vectorize.upsert(vectors);

			this.logOperation("Indexed session digest", {
				digestId: digest.id,
				sectionsCount: sections.length,
			});
		} catch (error) {
			this.logOperation("Failed to index session digest", {
				digestId: digest.id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Index a world state changelog entry
	 */
	async indexChangelogEntry(
		entry: WorldStateChangelogEntry,
		additionalMetadata?: {
			archived?: boolean;
			archiveKey?: string;
			r2Key?: string;
		}
	): Promise<void> {
		try {
			this.validateDependencies();

			const contentParts: string[] = [];

			if (entry.payload.new_entities.length > 0) {
				contentParts.push(
					`New entities: ${entry.payload.new_entities
						.map((e) => e.name || e.entity_id || "unknown")
						.join(", ")}`
				);
			}

			if (entry.payload.entity_updates.length > 0) {
				contentParts.push(
					`Entity updates: ${entry.payload.entity_updates
						.map((u) => u.entity_id)
						.join(", ")}`
				);
			}

			if (entry.payload.relationship_updates.length > 0) {
				contentParts.push(
					`Relationship updates: ${entry.payload.relationship_updates
						.map((r) => `${r.from} -> ${r.to}`)
						.join(", ")}`
				);
			}

			if (contentParts.length === 0) {
				return;
			}

			const content = contentParts.join(". ");
			const [embedding] = await this.generateEmbeddings([content]);

			const vectorId = `changelog_${entry.id}`;
			await this.vectorize.upsert([
				{
					id: vectorId,
					values: embedding,
					metadata: {
						changelogId: entry.id,
						campaignId: entry.campaignId,
						campaignSessionId: entry.campaignSessionId?.toString() || "",
						timestamp: entry.timestamp,
						contentType: "changelog",
						...(additionalMetadata?.archived && { archived: "true" }),
						...(additionalMetadata?.archiveKey && {
							archiveKey: additionalMetadata.archiveKey,
						}),
						...(additionalMetadata?.r2Key && {
							r2Key: additionalMetadata.r2Key,
						}),
					},
				},
			]);

			this.logOperation("Indexed changelog entry", {
				changelogId: entry.id,
				archived: additionalMetadata?.archived,
			});
		} catch (error) {
			this.logOperation("Failed to index changelog entry", {
				changelogId: entry.id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Calculate recency weight using exponential decay based on session gap
	 * Uses sequential session numbers instead of calendar days to account for
	 * irregular meeting schedules and in-game vs real-world time differences
	 */
	private calculateRecencyWeight(
		sessionNumber: number | null,
		currentMaxSessionNumber: number | null,
		decayRate: number = this.defaultDecayRate
	): number {
		if (!sessionNumber || !currentMaxSessionNumber) {
			return 0.5;
		}

		const sessionsSince = currentMaxSessionNumber - sessionNumber;
		return Math.exp(-decayRate * sessionsSince);
	}

	/**
	 * Use LLM to intelligently extract entity names from query
	 * More reliable than manual parsing - understands context and intent
	 * Results are cached per (campaignId, query) with 5-minute TTL.
	 */
	private async extractEntityNamesWithLLM(
		campaignId: string,
		query: string
	): Promise<string[]> {
		const cacheKey = this.buildEntityNamesCacheKey(campaignId, query);
		const cached = PlanningContextService.entityNamesCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.names;
		}
		if (cached && cached.expiresAt <= Date.now()) {
			PlanningContextService.entityNamesCache.delete(cacheKey);
		}

		try {
			const apiKey =
				typeof this.openaiApiKey === "string" ? this.openaiApiKey : "";
			if (!apiKey) {
				return [];
			}

			const extractionSchema = z.object({
				entityNames: z
					.array(z.string())
					.describe(
						"List of entity names, character names, location names, or other proper nouns mentioned in the query"
					),
			});

			const prompt =
				PLANNING_CONTEXT_PROMPTS.formatEntityExtractionPrompt(query);

			const llmProvider = createLLMProvider({
				provider: MODEL_CONFIG.PROVIDER.DEFAULT,
				apiKey,
				// Use centralized analysis model for lightweight structured extraction
				defaultModel: getGenerationModelForProvider("ANALYSIS"),
				defaultTemperature: 0.1,
				defaultMaxTokens: 500, // Small response for simple extraction
			});

			const result = await llmProvider.generateStructuredOutput<
				z.infer<typeof extractionSchema>
			>(prompt, {
				model: getGenerationModelForProvider("ANALYSIS"),
				temperature: 0.1,
				maxTokens: 500,
			});

			const parsed = extractionSchema.safeParse(result);
			if (!parsed.success) {
				return [];
			}
			const entityNames = parsed.data.entityNames.filter(
				(name) => name.length >= 2
			);

			if (entityNames.length > 0) {
			}

			PlanningContextService.entityNamesCache.set(cacheKey, {
				names: entityNames,
				expiresAt: Date.now() + this.entityNamesCacheTTL,
			});
			return entityNames;
		} catch (_error) {
			// Return empty array - fallback to keyword search
			return [];
		}
	}

	/**
	 * Find entities matching query using semantic similarity (primary) and keyword matching (fallback)
	 * Returns entity IDs that match the query
	 */
	async findMatchingEntityIds(
		campaignId: string,
		query: string,
		queryEmbedding: number[],
		maxEntities: number = 20
	): Promise<string[]> {
		const contexts = await this.findEntityGraphContext(
			campaignId,
			query,
			queryEmbedding,
			maxEntities,
			0 // Don't need neighbors for just getting entity IDs
		);
		return contexts.map((ctx) => ctx.entityId);
	}

	/**
	 * Find entities matching query using semantic similarity (primary) and keyword matching (fallback)
	 */
	private async findEntityGraphContext(
		campaignId: string,
		query: string,
		queryEmbedding: number[],
		maxEntities: number = 5,
		maxNeighborsPerEntity: number = 5
	): Promise<EntityGraphContext[]> {
		try {
			const daoFactory = getDAOFactory(this.env);
			const graphService = new EntityGraphService(daoFactory.entityDAO);
			const entityEmbeddingService = new EntityEmbeddingService(
				this.env.VECTORIZE
			);

			const foundEntities = new Map<
				string,
				{ entity: Entity; score: number; matchedKeywords: string[] }
			>();

			// Method 1: Try semantic similarity search (if entity embeddings exist)
			try {
				const similarEntities =
					await entityEmbeddingService.findSimilarByEmbedding(queryEmbedding, {
						campaignId,
						topK: maxEntities,
					});

				if (similarEntities.length > 0) {
					for (const similar of similarEntities) {
						// Only include if similarity score is reasonable (above 0.3)
						if (similar.score >= 0.3) {
							const entity = await daoFactory.entityDAO.getEntityById(
								similar.entityId
							);
							if (entity && entity.campaignId === campaignId) {
								foundEntities.set(entity.id, {
									entity,
									score: similar.score,
									matchedKeywords: [],
								});
							}
						}
					}
				}
			} catch (_error) {
				// Continue to fallback method
			}

			// Method 2: LLM-based entity name extraction (if semantic search didn't find enough)
			// Use intelligent LLM extraction instead of manual parsing
			if (foundEntities.size < maxEntities) {
				const llmExtractedNames = await this.extractEntityNamesWithLLM(
					campaignId,
					query
				);

				if (llmExtractedNames.length > 0) {
					try {
						const keywordEntities =
							await daoFactory.entityDAO.searchEntitiesByName(
								campaignId,
								llmExtractedNames,
								{ limit: maxEntities * 2 }
							);

						for (const entity of keywordEntities) {
							// Avoid duplicates - prefer semantic matches
							if (!foundEntities.has(entity.id)) {
								// Find which names matched this entity
								const matchedKeywords = llmExtractedNames.filter(
									(name) =>
										entity.name.toLowerCase().includes(name.toLowerCase()) ||
										name.toLowerCase().includes(entity.name.toLowerCase())
								);

								if (matchedKeywords.length > 0) {
									foundEntities.set(entity.id, {
										entity,
										score: 0.6, // Slightly higher score for LLM-extracted matches
										matchedKeywords,
									});
								}
							}
						}

						if (keywordEntities.length > 0) {
						}
					} catch (_error) {
						// Continue with whatever we have
					}
				} else if (llmExtractedNames.length === 0 && this.openaiApiKey) {
				}
			}

			if (foundEntities.size === 0) {
				return [];
			}

			// Sort by score (semantic matches first, then keyword matches)
			const sortedEntities = Array.from(foundEntities.values()).sort(
				(a, b) => b.score - a.score
			);

			// Take top entities
			const topEntities = sortedEntities.slice(0, maxEntities);

			// Get graph neighbors for each matching entity
			const entityContexts: EntityGraphContext[] = [];

			for (const { entity, matchedKeywords } of topEntities) {
				try {
					const neighbors = await graphService.getNeighbors(
						campaignId,
						entity.id,
						{
							maxDepth: 2,
						}
					);

					entityContexts.push({
						entityId: entity.id,
						entityName: entity.name,
						entityType: entity.entityType,
						neighbors: neighbors.slice(0, maxNeighborsPerEntity),
						matchedKeywords,
					});
				} catch (_error) {
					// Continue with other entities even if one fails
				}
			}

			return entityContexts;
		} catch (_error) {
			// Return empty array on error - don't fail the entire search
			return [];
		}
	}

	/**
	 * Search planning context with semantic similarity and recency weighting
	 */
	async search(
		options: PlanningContextSearchOptions
	): Promise<PlanningContextSearchResult[]> {
		const searchStartTime = Date.now();
		try {
			this.validateDependencies();

			const {
				campaignId,
				query,
				limit = 10,
				fromDate,
				toDate,
				sectionTypes: sectionTypesOpt,
				applyRecencyWeighting = true,
				decayRate = this.defaultDecayRate,
				forPlayer = false,
			} = options;
			const sectionTypes =
				forPlayer && (!sectionTypesOpt || sectionTypesOpt.length === 0)
					? Array.from(PLAYER_SAFE_PLANNING_SECTION_TYPES)
					: sectionTypesOpt;
			const [queryEmbedding] = await this.generateEmbeddings([query]);

			const daoFactory = getDAOFactory(this.env);
			const currentMaxSessionNumber =
				await daoFactory.sessionDigestDAO.getMaxSessionNumber(campaignId);
			const vectorResults = await this.vectorize.query(queryEmbedding, {
				topK: limit * 2,
				returnMetadata: true,
				filter: {
					campaignId,
					contentType: "session_digest",
				},
			});

			const matches = vectorResults.matches || [];
			const entityGraphContext = await this.findEntityGraphContext(
				campaignId,
				query,
				queryEmbedding, // Use the query embedding for semantic search
				5, // max entities
				5 // max neighbors per entity
			);

			if (entityGraphContext.length > 0) {
			}

			const results: PlanningContextSearchResult[] = [];
			const seenDigestIds = new Set<string>();

			for (const match of matches) {
				if (!match.id || !match.metadata) {
					continue;
				}

				const metadata = match.metadata;
				const digestId = this.getStringMetadata(metadata, "digestId");
				if (!digestId || seenDigestIds.has(digestId)) {
					continue;
				}

				const matchCampaignId = this.getStringMetadata(metadata, "campaignId");
				if (matchCampaignId !== campaignId) {
					continue;
				}

				const sessionDate = this.getStringMetadata(metadata, "sessionDate");
				const sessionNumber = this.getNumberMetadata(metadata, "sessionNumber");
				const sectionType = this.getStringMetadata(metadata, "sectionType");

				if (!sectionType) {
					continue;
				}

				if (
					sectionTypes &&
					sectionTypes.length > 0 &&
					!sectionTypes.includes(sectionType)
				) {
					continue;
				}

				if (forPlayer && !PLAYER_SAFE_PLANNING_SECTION_TYPES.has(sectionType)) {
					continue;
				}

				if (fromDate && sessionDate && sessionDate < fromDate) {
					continue;
				}

				if (toDate && sessionDate && sessionDate > toDate) {
					continue;
				}

				let recencyWeightedScore = match.score || 0;
				if (applyRecencyWeighting) {
					const recencyWeight = this.calculateRecencyWeight(
						sessionNumber,
						currentMaxSessionNumber,
						decayRate
					);
					recencyWeightedScore = match.score * recencyWeight;
				}

				const digest =
					await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);

				if (!digest) {
					continue;
				}

				const section = this.extractDigestSections(digest).find(
					(s) => s.sectionType === sectionType
				);

				if (!section) {
					continue;
				}

				results.push({
					digestId,
					sessionNumber: sessionNumber || digest.sessionNumber,
					sessionDate: sessionDate || digest.sessionDate,
					sectionType,
					sectionContent: section.content,
					similarityScore: match.score || 0,
					recencyWeightedScore,
					digest,
				});

				seenDigestIds.add(digestId);
			}

			results.sort((a, b) => b.recencyWeightedScore - a.recencyWeightedScore);

			const finalResults = results.slice(0, limit);

			// Augment results with entity graph context if available
			if (entityGraphContext.length > 0) {
				// Attach graph context to results (all results get the same graph context)
				// In the future, could match specific entities mentioned in each result
				finalResults.forEach((result) => {
					result.relatedEntities = entityGraphContext;
				});
			}

			const searchDuration = Date.now() - searchStartTime;

			this.logOperation("Planning context search completed", {
				campaignId,
				query: query.substring(0, 100),
				resultsCount: finalResults.length,
				graphEntities: entityGraphContext.length,
			});

			// Record query latency metrics (fire and forget)
			const telemetryService = new TelemetryService(new TelemetryDAO(this.db));
			telemetryService
				.recordQueryLatency(searchDuration, {
					campaignId,
					queryType: "planning_context",
					metadata: {
						resultsCount: finalResults.length,
						totalMatches: matches.length,
						graphEntities: entityGraphContext.length,
					},
				})
				.catch((_error) => {});

			return finalResults;
		} catch (error) {
			const errorResponse = this.createErrorResponse(
				"Failed to search planning context",
				error
			);
			throw new Error(errorResponse.error);
		}
	}

	/**
	 * Delete embeddings for a session digest
	 */
	async deleteSessionDigest(digestId: string): Promise<void> {
		try {
			this.validateDependencies();

			const allVectors = await this.vectorize.query([], {
				topK: 1000,
				returnMetadata: true,
				filter: {
					digestId,
				},
			});

			const idsToDelete = (allVectors.matches || [])
				.map((m) => m.id)
				.filter((id): id is string => typeof id === "string");

			if (idsToDelete.length > 0) {
				await this.vectorize.deleteByIds(idsToDelete);
			}

			this.logOperation("Deleted session digest embeddings", {
				digestId,
				deletedCount: idsToDelete.length,
			});
		} catch (error) {
			this.logOperation("Failed to delete session digest embeddings", {
				digestId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private getStringMetadata(
		metadata: Record<string, unknown> | undefined,
		key: string
	): string | null {
		if (!metadata) {
			return null;
		}
		const value = metadata[key];
		return typeof value === "string" ? value : null;
	}

	private getNumberMetadata(
		metadata: Record<string, unknown> | undefined,
		key: string
	): number | null {
		if (!metadata) {
			return null;
		}
		const value = metadata[key];
		return typeof value === "number" ? value : null;
	}
}
