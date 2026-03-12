import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import {
	STRUCTURED_ENTITY_TYPES,
	type StructuredEntityType,
} from "@/lib/entity/entity-types";
import {
	normalizeRelationshipStrength,
	normalizeRelationshipType,
	type RelationshipType,
} from "@/lib/entity/relationship-types";
import { EntityExtractionError, LLMProviderAPIKeyError } from "@/lib/errors";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import { parseOrThrow } from "@/lib/zod-utils";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import type { TelemetryService } from "@/services/telemetry/telemetry-service";

/**
 * Maximum tokens for entity extraction responses.
 *
 * Anthropic structured generation is more reliable with smaller output budgets.
 * Keep OpenAI on the larger budget while using a safer ceiling for Anthropic.
 */
const MAX_EXTRACTION_RESPONSE_TOKENS =
	MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic" ? 2000 : 16384;

// Zod schema for entity extraction response
// This matches the structure expected by the RPG extraction prompt
// Using z.record(z.unknown()) for array items to allow flexible entity structures
const EntityItemSchema = z.record(z.string(), z.unknown());

const EntityExtractionSchema = z.object({
	meta: z.object({
		source: z.object({
			doc: z.string(),
			pages: z.string().optional(),
			anchor: z.string().optional(),
		}),
	}),
	monsters: z.array(EntityItemSchema).default([]),
	npcs: z.array(EntityItemSchema).default([]),
	spells: z.array(EntityItemSchema).default([]),
	items: z.array(EntityItemSchema).default([]),
	traps: z.array(EntityItemSchema).default([]),
	hazards: z.array(EntityItemSchema).default([]),
	conditions: z.array(EntityItemSchema).default([]),
	vehicles: z.array(EntityItemSchema).default([]),
	env_effects: z.array(EntityItemSchema).default([]),
	hooks: z.array(EntityItemSchema).default([]),
	plot_lines: z.array(EntityItemSchema).default([]),
	quests: z.array(EntityItemSchema).default([]),
	scenes: z.array(EntityItemSchema).default([]),
	locations: z.array(EntityItemSchema).default([]),
	lairs: z.array(EntityItemSchema).default([]),
	factions: z.array(EntityItemSchema).default([]),
	deities: z.array(EntityItemSchema).default([]),
	backgrounds: z.array(EntityItemSchema).default([]),
	feats: z.array(EntityItemSchema).default([]),
	subclasses: z.array(EntityItemSchema).default([]),
	rules: z.array(EntityItemSchema).default([]),
	house_rule: z.array(EntityItemSchema).default([]),
	downtime: z.array(EntityItemSchema).default([]),
	tables: z.array(EntityItemSchema).default([]),
	encounter_tables: z.array(EntityItemSchema).default([]),
	treasure_tables: z.array(EntityItemSchema).default([]),
	maps: z.array(EntityItemSchema).default([]),
	handouts: z.array(EntityItemSchema).default([]),
	puzzles: z.array(EntityItemSchema).default([]),
	timelines: z.array(EntityItemSchema).default([]),
	travel: z.array(EntityItemSchema).default([]),
	custom: z.array(EntityItemSchema).default([]),
});

export interface ExtractEntitiesOptions {
	content: string;
	sourceName: string;
	campaignId: string;
	sourceId: string;
	sourceType: string;
	metadata?: Record<string, unknown>;
	llmApiKey?: string;
	/** Username for rate limit attribution */
	username?: string;
	/** Callback to record usage (tokens, queryCount) for rate limiting */
	onUsage?: (
		usage: { tokens: number; queryCount: number },
		context?: { model?: string }
	) => void | Promise<void>;
}

export interface ExtractedRelationship {
	relationshipType: RelationshipType;
	targetId: string;
	metadata?: Record<string, unknown>;
	strength?: number | null;
}

export interface ExtractedEntity {
	id: string;
	entityType: StructuredEntityType;
	name: string;
	content: unknown;
	metadata: Record<string, unknown>;
	relations: ExtractedRelationship[];
}

export class EntityExtractionService {
	constructor(
		private readonly llmApiKey: string | null = null,
		private readonly telemetryService: TelemetryService | null = null
	) {}

	async extractEntities(
		options: ExtractEntitiesOptions
	): Promise<ExtractedEntity[]> {
		const apiKey = options.llmApiKey || this.llmApiKey;
		if (!apiKey) {
			throw new LLMProviderAPIKeyError(
				`${MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic" ? "Anthropic" : "OpenAI"} API key is required for entity extraction.`
			);
		}

		const prompt = RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(
			options.sourceName
		);

		const fullPrompt = `${prompt}

CONTENT START
${options.content}
CONTENT END`;

		// Use OpenAIProvider to generate structured JSON output
		const parsed = await this.callStructuredModel(fullPrompt, apiKey, {
			username: options.username,
			onUsage: options.onUsage,
		});

		if (!parsed) {
			console.warn(
				"[EntityExtractionService] No structured content returned from model"
			);
			return [];
		}

		const results: ExtractedEntity[] = [];
		const entityCountsByType: Record<string, number> = {};

		for (const type of STRUCTURED_ENTITY_TYPES) {
			const entries = (parsed as Record<string, unknown>)[type];
			if (!Array.isArray(entries)) {
				continue;
			}

			entityCountsByType[type] = entries.length;

			for (const entry of entries) {
				if (!entry || typeof entry !== "object") {
					continue;
				}

				const record = entry as Record<string, unknown>;
				// Make entity IDs campaign-scoped from the start
				const baseId =
					typeof record.id === "string" && record.id.length > 0
						? record.id
						: crypto.randomUUID();
				const entityId = `${options.campaignId}_${baseId}`;

				// Extract name from standard fields - all entities should have name, title, or display_name
				// The LLM is instructed to always provide at least one of these fields
				const nameFields = ["name", "title", "display_name"];

				// Check "id" as a last resort (before falling back to generated name)
				nameFields.push("id");

				const name =
					this.getFirstString(record, nameFields) || `${type}-${entityId}`;

				// Log warning if entity doesn't have a proper name field (shouldn't happen if LLM follows instructions)
				if (!this.getFirstString(record, ["name", "title", "display_name"])) {
					console.warn(
						`[EntityExtractionService] Entity ${entityId} (type: ${type}) missing name/title/display_name field. Using fallback: ${name}`
					);
				}

				const relations = Array.isArray(record.relations)
					? this.normalizeRelationships(record.relations)
					: [];

				if (relations.length > 0) {
					console.log(
						`[EntityExtractionService] Extracted ${relations.length} relationships for entity ${entityId} (${name}):`,
						relations.map((r) => `${r.relationshipType} -> ${r.targetId}`)
					);
				}

				results.push({
					id: entityId,
					entityType: type,
					name,
					content: record,
					metadata: {
						...options.metadata,
						sourceId: options.sourceId,
						sourceType: options.sourceType,
						campaignId: options.campaignId,
					},
					relations,
				});
			}
		}

		const totalEntities = results.length;
		const totalRelationships = results.reduce(
			(sum, e) => sum + e.relations.length,
			0
		);
		const entitiesWithRelations = results.filter(
			(e) => e.relations.length > 0
		).length;
		console.log(
			`[EntityExtractionService] Extracted ${totalEntities} total entities (${entitiesWithRelations} with relationships) from ${options.sourceName}. Breakdown by type:`,
			Object.entries(entityCountsByType)
				.filter(([_, count]) => count > 0)
				.map(([type, count]) => `${type}: ${count}`)
				.join(", ")
		);

		// Record extraction metrics (fire and forget)
		if (this.telemetryService) {
			const telemetryPromises = [
				// Record extraction count (1 per call)
				this.telemetryService
					.recordEntityExtractionCount(1, {
						campaignId: options.campaignId,
						metadata: {
							sourceName: options.sourceName,
							sourceType: options.sourceType,
							sourceId: options.sourceId,
						},
					})
					.catch((error) => {
						console.error(
							"[EntityExtraction] Failed to record extraction count:",
							error
						);
					}),

				// Record entities extracted
				this.telemetryService
					.recordEntitiesExtracted(totalEntities, {
						campaignId: options.campaignId,
						metadata: {
							sourceName: options.sourceName,
							entityCountsByType,
							entitiesWithRelations,
						},
					})
					.catch((error) => {
						console.error(
							"[EntityExtraction] Failed to record entities extracted:",
							error
						);
					}),

				// Record relationship extraction count
				this.telemetryService
					.recordRelationshipExtractionCount(totalRelationships, {
						campaignId: options.campaignId,
						metadata: {
							sourceName: options.sourceName,
							entitiesWithRelations,
						},
					})
					.catch((error) => {
						console.error(
							"[EntityExtraction] Failed to record relationships:",
							error
						);
					}),
			];

			await Promise.allSettled(telemetryPromises);
		}

		return results;
	}

	/**
	 * Call configured LLM provider with structured output.
	 * This generates JSON and validates it against our Zod schema
	 */
	private async callStructuredModel(
		prompt: string,
		apiKey: string,
		usageOptions?: {
			username?: string;
			onUsage?: ExtractEntitiesOptions["onUsage"];
		}
	): Promise<z.infer<typeof EntityExtractionSchema> | null> {
		try {
			// Create LLM provider using configured default provider
			const llmProvider = createLLMProvider({
				provider: MODEL_CONFIG.PROVIDER.DEFAULT,
				apiKey,
				// Use non-interactive structured pipeline tier for extraction
				defaultModel: getGenerationModelForProvider("PIPELINE_LIGHT"),
				defaultTemperature: 0.1,
				defaultMaxTokens: MAX_EXTRACTION_RESPONSE_TOKENS,
			});

			// Generate structured output (returns parsed JSON)
			const result = await llmProvider.generateStructuredOutput<
				z.infer<typeof EntityExtractionSchema>
			>(prompt, {
				model: getGenerationModelForProvider("PIPELINE_LIGHT"),
				temperature: 0.1,
				maxTokens: MAX_EXTRACTION_RESPONSE_TOKENS,
				username: usageOptions?.username,
				onUsage: usageOptions?.onUsage,
			});

			// Validate the result against our Zod schema (LLM output may be malformed)
			return parseOrThrow(EntityExtractionSchema, result, {
				logPrefix: "[EntityExtractionService]",
				messagePrefix: "Schema validation failed",
				customError: (msg) => new EntityExtractionError(msg),
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const isNoOutput =
				errorMessage.includes("No output generated") ||
				errorMessage.includes("AI_NoOutputGeneratedError") ||
				errorMessage.includes("No object generated") ||
				errorMessage.includes("AI_NoObjectGeneratedError") ||
				errorMessage.includes("could not parse the response") ||
				errorMessage.includes("AI_RetryError") ||
				errorMessage.includes("Failed after 3 attempts");

			// No output from model: return null so caller can treat as empty extraction
			if (isNoOutput) {
				console.warn(
					"[EntityExtractionService] Model returned no structured output, treating as empty extraction"
				);
				return null;
			}

			console.error(
				"[EntityExtractionService] Error calling structured extraction model:",
				error
			);
			if (error instanceof EntityExtractionError) {
				throw error;
			}
			throw new EntityExtractionError(errorMessage);
		}
	}

	private normalizeRelationships(
		relations: unknown[]
	): ExtractedRelationship[] {
		return relations.reduce<ExtractedRelationship[]>((acc, relation) => {
			if (!relation || typeof relation !== "object") {
				return acc;
			}

			const rel = relation as Record<string, unknown>;
			const rawType = rel.rel ?? rel.type ?? rel.relationship_type;
			const targetValue =
				rel.target_id ?? rel.targetId ?? rel.target ?? rel.targetId;

			if (typeof targetValue !== "string") {
				return acc;
			}

			const normalizedType = normalizeRelationshipType(rawType);

			const normalized: ExtractedRelationship = {
				relationshipType: normalizedType,
				targetId: targetValue,
				strength: normalizeRelationshipStrength(rel.strength ?? rel.confidence),
			};

			if (
				rel.metadata &&
				typeof rel.metadata === "object" &&
				rel.metadata !== null
			) {
				normalized.metadata = rel.metadata as Record<string, unknown>;
			}

			acc.push(normalized);
			return acc;
		}, []);
	}

	private getFirstString(
		record: Record<string, unknown>,
		keys: string[]
	): string | null {
		for (const key of keys) {
			const value = record[key];
			if (typeof value === "string" && value.trim().length > 0) {
				return value.trim();
			}
		}
		return null;
	}
}
