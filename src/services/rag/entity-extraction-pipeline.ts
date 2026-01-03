import type { EntityDAO, Entity, EntityRelationship } from "@/dao/entity-dao";
import type { EntityGraphService } from "@/services/graph/entity-graph-service";
import type { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import type { EntityExtractionService } from "./entity-extraction-service";
import { OpenAIEmbeddingService } from "@/services/embedding/openai-embedding-service";
import { OpenAIAPIKeyError, EmbeddingGenerationError } from "@/lib/errors";

export interface EntityExtractionPipelineOptions {
  campaignId: string;
  sourceId: string;
  sourceType: string;
  sourceName: string;
  content: string;
  metadata?: Record<string, unknown>;
  entityTypeHint?: string;
}

export interface EntityExtractionPipelineResult {
  entities: Entity[];
  relationships: EntityRelationship[];
}

export class EntityExtractionPipeline {
  private readonly openaiEmbeddingService: OpenAIEmbeddingService;

  constructor(
    private readonly entityDAO: EntityDAO,
    private readonly extractionService: EntityExtractionService,
    private readonly embeddingService: EntityEmbeddingService,
    private readonly graphService: EntityGraphService,
    private readonly env: any,
    private readonly openaiApiKey?: string
  ) {
    const apiKey = this.openaiApiKey || this.env?.OPENAI_API_KEY;
    this.openaiEmbeddingService = new OpenAIEmbeddingService(apiKey);
  }

  async run(
    options: EntityExtractionPipelineOptions
  ): Promise<EntityExtractionPipelineResult> {
    const extractedEntities = await this.extractionService.extractEntities({
      content: options.content,
      sourceName: options.sourceName,
      sourceId: options.sourceId,
      sourceType: options.sourceType,
      campaignId: options.campaignId,
      metadata: options.metadata,
    });

    if (extractedEntities.length === 0) {
      return { entities: [], relationships: [] };
    }

    const persistedEntities: Entity[] = [];
    const entityIdSet = new Set<string>();
    // Map extracted IDs to actual entity IDs (for cases where existing entity found by name/type)
    const extractedIdToEntityId = new Map<string, string>();

    for (const extracted of extractedEntities) {
      // First check if entity exists by ID (exact match)
      let existing = await this.entityDAO.getEntityById(extracted.id);

      // If not found by ID, check if an entity with the same name and type already exists
      // This handles cases where the same entity is extracted with a different ID
      if (!existing) {
        existing = await this.entityDAO.findEntityByNameAndType(
          options.campaignId,
          extracted.name,
          extracted.entityType
        );
      }

      const entityPayload = {
        content: extracted.content,
        metadata: extracted.metadata,
        confidence: this.getConfidence(extracted),
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        embeddingId: extracted.id,
      } as const;

      if (existing) {
        // Entity already exists - stage the update for user approval
        const existingMetadata =
          (existing.metadata as Record<string, unknown>) || {};

        // Store original content in metadata for comparison during approval
        const stagedMetadata = {
          ...entityPayload.metadata,
          shardStatus: "staging" as const,
          staged: true,
          stagedAt: new Date().toISOString(),
          stagedFrom: {
            sourceType: options.sourceType,
            sourceId: options.sourceId,
            sourceName: options.sourceName,
          },
          // Preserve original content for comparison
          originalContent: existing.content,
          originalMetadata: existingMetadata,
        };

        // Use existing entity ID (not the extracted ID, which might be different)
        await this.entityDAO.updateEntity(existing.id, {
          name: extracted.name,
          content: entityPayload.content,
          metadata: stagedMetadata,
          confidence: entityPayload.confidence,
          sourceType: entityPayload.sourceType,
          sourceId: entityPayload.sourceId,
          embeddingId: existing.embeddingId || entityPayload.embeddingId,
        });

        const updated = await this.entityDAO.getEntityById(existing.id);
        if (updated) {
          persistedEntities.push(updated);
          entityIdSet.add(updated.id);
          // Map extracted ID to existing entity ID for relationship resolution
          extractedIdToEntityId.set(extracted.id, updated.id);
        }
      } else {
        // New entity - create with staging status
        const newEntityMetadata = {
          ...entityPayload.metadata,
          shardStatus: "staging" as const,
          staged: true,
          stagedAt: new Date().toISOString(),
          stagedFrom: {
            sourceType: options.sourceType,
            sourceId: options.sourceId,
            sourceName: options.sourceName,
          },
        };

        await this.entityDAO.createEntity({
          id: extracted.id,
          campaignId: options.campaignId,
          entityType: extracted.entityType,
          name: extracted.name,
          content: entityPayload.content,
          metadata: newEntityMetadata,
          confidence: entityPayload.confidence,
          sourceType: entityPayload.sourceType,
          sourceId: entityPayload.sourceId,
          embeddingId: entityPayload.embeddingId,
        });
        const created = await this.entityDAO.getEntityById(extracted.id);
        if (created) {
          persistedEntities.push(created);
          entityIdSet.add(created.id);
          // Map extracted ID to itself (no change)
          extractedIdToEntityId.set(extracted.id, extracted.id);
        }
      }

      // Use actual entity ID for embedding (may differ from extracted ID if entity was found by name/type)
      const actualEntityId =
        extractedIdToEntityId.get(extracted.id) || extracted.id;
      await this.upsertEmbedding(
        { ...extracted, id: actualEntityId },
        options.campaignId
      );
    }

    const relationships: EntityRelationship[] = [];
    const createdRelationshipKeys = new Set<string>();
    for (const extracted of extractedEntities) {
      // Get the actual entity ID (may differ from extracted ID if entity was found by name/type)
      const actualEntityId = extractedIdToEntityId.get(extracted.id);
      if (!actualEntityId || !entityIdSet.has(actualEntityId)) {
        continue;
      }

      for (const relation of extracted.relations) {
        if (!relation.targetId) {
          continue;
        }

        // Resolve target entity ID (may be mapped if entity was found by name/type)
        const actualTargetId =
          extractedIdToEntityId.get(relation.targetId) || relation.targetId;

        if (actualTargetId === actualEntityId) {
          continue;
        }

        const relationKey = `${actualEntityId}:${actualTargetId}:${relation.relationshipType}`;
        if (createdRelationshipKeys.has(relationKey)) {
          continue;
        }

        let targetExists = entityIdSet.has(actualTargetId);
        if (!targetExists) {
          const target = await this.entityDAO.getEntityById(actualTargetId);
          if (target) {
            entityIdSet.add(actualTargetId);
            targetExists = true;
          }
        }

        if (!targetExists) {
          continue;
        }

        const edges = await this.graphService.upsertEdge({
          campaignId: options.campaignId,
          fromEntityId: actualEntityId,
          toEntityId: actualTargetId,
          relationshipType: relation.relationshipType,
          strength: relation.strength ?? null,
          metadata:
            relation.metadata && typeof relation.metadata === "object"
              ? relation.metadata
              : undefined,
          allowSelfRelation: false,
        });

        createdRelationshipKeys.add(relationKey);
        for (const edge of edges) {
          const key = `${edge.fromEntityId}:${edge.toEntityId}:${edge.relationshipType}`;
          if (!createdRelationshipKeys.has(key)) {
            relationships.push(edge);
            createdRelationshipKeys.add(key);
          }
        }
      }
    }

    return { entities: persistedEntities, relationships };
  }

  private getConfidence(extracted: {
    metadata: Record<string, unknown>;
  }): number | null {
    const confidenceValue = extracted.metadata?.confidence;
    if (typeof confidenceValue === "number") {
      return confidenceValue;
    }
    return null;
  }

  private async upsertEmbedding(
    extracted: {
      id: string;
      entityType: string;
      metadata: Record<string, unknown>;
      content: unknown;
    },
    campaignId: string
  ): Promise<void> {
    try {
      const text = this.stringifyContent(extracted.content);
      const embedding = await this.generateEmbedding(text);
      await this.embeddingService.upsertEmbedding({
        entityId: extracted.id,
        campaignId,
        entityType: extracted.entityType,
        embedding,
        metadata: extracted.metadata,
      });
    } catch (error) {
      console.warn(
        `[EntityExtractionPipeline] Failed to upsert embedding for entity ${extracted.id}`,
        error
      );
    }
  }

  private stringifyContent(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    try {
      return JSON.stringify(content);
    } catch (_error) {
      return String(content);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await this.openaiEmbeddingService.generateEmbedding(text);
    } catch (error) {
      console.warn(
        "[EntityExtractionPipeline] Failed to generate embedding, using fallback",
        error
      );
      if (
        error instanceof EmbeddingGenerationError ||
        error instanceof OpenAIAPIKeyError
      ) {
        throw error;
      }
      // If error is not an expected error type, fall back to deterministic embedding
      return this.generateFallbackEmbedding(text);
    }
  }

  private generateFallbackEmbedding(text: string): number[] {
    // Fallback approximation: produce a deterministic vector (matching OpenAI text-embedding-3-small)
    // by hashing character codes into buckets. Ensures dedupe flow still has a vector even if model request fails.
    const normalized = text.toLowerCase();
    const dimensions = OpenAIEmbeddingService.EXPECTED_DIMENSIONS;
    const vector = new Array(dimensions).fill(0);
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      vector[i % dimensions] += charCode / 255;
    }
    return vector;
  }
}
