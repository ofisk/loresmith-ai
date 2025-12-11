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

    for (const extracted of extractedEntities) {
      const existing = await this.entityDAO.getEntityById(extracted.id);
      const entityPayload = {
        content: extracted.content,
        metadata: extracted.metadata,
        confidence: this.getConfidence(extracted),
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        embeddingId: extracted.id,
      } as const;

      if (existing) {
        await this.entityDAO.updateEntity(extracted.id, {
          name: extracted.name,
          content: entityPayload.content,
          metadata: entityPayload.metadata,
          confidence: entityPayload.confidence,
          sourceType: entityPayload.sourceType,
          sourceId: entityPayload.sourceId,
          embeddingId: entityPayload.embeddingId,
        });
        const updated = await this.entityDAO.getEntityById(extracted.id);
        if (updated) {
          persistedEntities.push(updated);
          entityIdSet.add(updated.id);
        }
      } else {
        await this.entityDAO.createEntity({
          id: extracted.id,
          campaignId: options.campaignId,
          entityType: extracted.entityType,
          name: extracted.name,
          content: entityPayload.content,
          metadata: entityPayload.metadata,
          confidence: entityPayload.confidence,
          sourceType: entityPayload.sourceType,
          sourceId: entityPayload.sourceId,
          embeddingId: entityPayload.embeddingId,
        });
        const created = await this.entityDAO.getEntityById(extracted.id);
        if (created) {
          persistedEntities.push(created);
          entityIdSet.add(created.id);
        }
      }

      await this.upsertEmbedding(extracted, options.campaignId);
    }

    const relationships: EntityRelationship[] = [];
    const createdRelationshipKeys = new Set<string>();
    for (const extracted of extractedEntities) {
      if (!entityIdSet.has(extracted.id)) {
        continue;
      }

      for (const relation of extracted.relations) {
        if (!relation.targetId) {
          continue;
        }

        if (relation.targetId === extracted.id) {
          continue;
        }

        const relationKey = `${extracted.id}:${relation.targetId}:${relation.relationshipType}`;
        if (createdRelationshipKeys.has(relationKey)) {
          continue;
        }

        let targetExists = entityIdSet.has(relation.targetId);
        if (!targetExists) {
          const target = await this.entityDAO.getEntityById(relation.targetId);
          if (target) {
            entityIdSet.add(relation.targetId);
            targetExists = true;
          }
        }

        if (!targetExists) {
          continue;
        }

        const edges = await this.graphService.upsertEdge({
          campaignId: options.campaignId,
          fromEntityId: extracted.id,
          toEntityId: relation.targetId,
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
