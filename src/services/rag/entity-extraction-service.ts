import {
  STRUCTURED_ENTITY_TYPES,
  type StructuredEntityType,
} from "@/lib/entity-types";
import {
  normalizeRelationshipStrength,
  normalizeRelationshipType,
  type RelationshipType,
} from "@/lib/relationship-types";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import { z } from "zod";
import { OpenAIAPIKeyError, EntityExtractionError } from "@/lib/errors";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import type { TelemetryService } from "@/services/telemetry/telemetry-service";

/**
 * Maximum tokens for entity extraction responses.
 *
 * GPT-4o supports up to 128k tokens in the context window, but we limit the response
 * to 16,384 tokens (~12,000 words) to:
 * 1. Keep response sizes manageable for parsing and processing
 * 2. Reduce API costs for large extractions
 * 3. Ensure consistent performance across different document sizes
 *
 * This limit allows for extraction of hundreds of entities while staying well within
 * the model's capabilities and reasonable cost bounds.
 */
const MAX_EXTRACTION_RESPONSE_TOKENS = 16384;

// Zod schema for entity extraction response
// This matches the structure expected by the RPG extraction prompt
// Using z.record(z.unknown()) for array items to allow flexible entity structures
const EntityItemSchema = z.record(z.unknown());

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
  openaiApiKey?: string;
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
    private readonly openaiApiKey: string | null = null,
    private readonly telemetryService: TelemetryService | null = null
  ) {}

  async extractEntities(
    options: ExtractEntitiesOptions
  ): Promise<ExtractedEntity[]> {
    const apiKey = options.openaiApiKey || this.openaiApiKey;
    if (!apiKey) {
      throw new OpenAIAPIKeyError(
        "OpenAI API key is required for entity extraction. Please provide openaiApiKey in options or constructor."
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
    const parsed = await this.callOpenAIModelStructured(fullPrompt, apiKey);

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

        // Build field priority list based on entity type
        // Type-specific fields should be checked before generic "id" field
        const nameFields = ["name", "title", "display_name"];

        // Add type-specific fields based on entity type
        if (type === "travel") {
          nameFields.push("route"); // Travel routes use "route" as the name
        } else if (type === "puzzles") {
          nameFields.push("prompt"); // Puzzles use "prompt" as the name
        } else if (type === "handouts") {
          nameFields.push("title"); // Handouts already have "title" but ensure it's prioritized
        } else if (type === "timelines") {
          nameFields.push("title"); // Timelines use "title" as the name
        } else if (type === "maps") {
          nameFields.push("title"); // Maps use "title" as the name
        }

        // Only check "id" as a last resort (before falling back to generated name)
        nameFields.push("id");

        const name =
          this.getFirstString(record, nameFields) || `${type}-${entityId}`;

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
   * Call OpenAI with structured output using OpenAIProvider
   * This generates JSON and validates it against our Zod schema
   */
  private async callOpenAIModelStructured(
    prompt: string,
    apiKey: string
  ): Promise<z.infer<typeof EntityExtractionSchema> | null> {
    try {
      // Create LLM provider with OpenAI
      const llmProvider = createLLMProvider({
        provider: "openai",
        apiKey,
        defaultModel: "gpt-4o",
        defaultTemperature: 0.1,
        defaultMaxTokens: MAX_EXTRACTION_RESPONSE_TOKENS,
      });

      // Generate structured output (returns parsed JSON)
      const result = await llmProvider.generateStructuredOutput<
        z.infer<typeof EntityExtractionSchema>
      >(prompt, {
        model: "gpt-4o",
        temperature: 0.1,
        maxTokens: MAX_EXTRACTION_RESPONSE_TOKENS,
      });

      // Validate the result against our Zod schema
      const validated = EntityExtractionSchema.parse(result);

      return validated;
    } catch (error) {
      console.error(
        "[EntityExtractionService] Error calling OpenAI API with structured output:",
        error
      );
      if (error instanceof z.ZodError) {
        console.error(
          "[EntityExtractionService] Schema validation failed:",
          error.errors
        );
        throw new EntityExtractionError(
          `Schema validation failed: ${error.errors.map((e) => e.message).join(", ")}`
        );
      }
      throw new EntityExtractionError(
        error instanceof Error ? error.message : "Unknown error"
      );
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
