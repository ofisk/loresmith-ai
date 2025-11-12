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

export interface ExtractEntitiesOptions {
  content: string;
  sourceName: string;
  campaignId: string;
  sourceId: string;
  sourceType: string;
  metadata?: Record<string, unknown>;
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
    private readonly env: any,
    private readonly model: string = "@cf/meta/llama-3.1-8b-instruct"
  ) {}

  async extractEntities(
    options: ExtractEntitiesOptions
  ): Promise<ExtractedEntity[]> {
    const prompt = RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(
      options.sourceName
    );

    const fullPrompt = `${prompt}

CONTENT START
${options.content}
CONTENT END`;

    const response = await this.callModel(fullPrompt);
    const parsed = this.safeParseJson(response);

    if (!parsed || typeof parsed !== "object") {
      console.warn("[EntityExtractionService] No structured content parsed");
      return [];
    }

    const results: ExtractedEntity[] = [];
    for (const type of STRUCTURED_ENTITY_TYPES) {
      const entries = (parsed as Record<string, unknown>)[type];
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const record = entry as Record<string, unknown>;
        const entityId =
          typeof record.id === "string" && record.id.length > 0
            ? record.id
            : crypto.randomUUID();

        const name =
          this.getFirstString(record, [
            "name",
            "title",
            "display_name",
            "id",
          ]) || `${type}-${entityId}`;

        const relations = Array.isArray(record.relations)
          ? this.normalizeRelationships(record.relations)
          : [];

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

    return results;
  }

  private async callModel(prompt: string): Promise<string> {
    if (!this.env?.AI) {
      throw new Error("AI binding not available for entity extraction");
    }

    const result = await this.env.AI.run(this.model, { prompt });
    if (typeof result === "string") {
      return result.trim();
    }

    if (result && typeof result === "object" && "response" in result) {
      const response = (result as Record<string, unknown>).response;
      if (typeof response === "string") {
        return response.trim();
      }
    }

    return JSON.stringify(result);
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

  private safeParseJson(content: string): unknown {
    const jsonMatch = content.match(/\{[\s\S]*\}$/);
    if (!jsonMatch) {
      return undefined;
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.warn(
        "[EntityExtractionService] Failed to parse JSON response",
        error
      );
      return undefined;
    }
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
