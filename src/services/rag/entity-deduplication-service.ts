import type {
  EntityDAO,
  Entity,
  EntityDeduplicationEntry,
} from "@/dao/entity-dao";
import type { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";

export interface DeduplicationConfig {
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  maxResults: number;
}

export interface DeduplicationMatch {
  entity: Entity;
  score: number;
}

export interface DeduplicationResult {
  highConfidenceMatches: DeduplicationMatch[];
  pendingEntryId?: string;
}

export class EntityDeduplicationService {
  private readonly config: DeduplicationConfig;

  constructor(
    private readonly entityDAO: EntityDAO,
    private readonly embeddingService: EntityEmbeddingService,
    config?: Partial<DeduplicationConfig>
  ) {
    this.config = {
      highConfidenceThreshold: 0.9,
      lowConfidenceThreshold: 0.75,
      maxResults: 10,
      ...config,
    };
  }

  async evaluateEntity(
    campaignId: string,
    entityId: string,
    entityType?: string
  ): Promise<DeduplicationResult> {
    const matches = await this.embeddingService.findSimilarByEntityId(
      entityId,
      {
        campaignId,
        entityType,
        topK: this.config.maxResults,
        excludeEntityIds: [entityId],
      }
    );

    if (!matches.length) {
      return { highConfidenceMatches: [] };
    }

    const highConfidence: DeduplicationMatch[] = [];
    const potentialDuplicates: DeduplicationMatch[] = [];

    for (const match of matches) {
      const entity = await this.entityDAO.getEntityById(match.entityId);
      if (!entity) {
        continue;
      }

      if (match.score >= this.config.highConfidenceThreshold) {
        highConfidence.push({ entity, score: match.score });
      } else if (match.score >= this.config.lowConfidenceThreshold) {
        potentialDuplicates.push({ entity, score: match.score });
      }
    }

    let pendingEntryId: string | undefined;
    if (potentialDuplicates.length) {
      const entryId = crypto.randomUUID();
      await this.entityDAO.createDeduplicationEntry({
        id: entryId,
        campaignId,
        newEntityId: entityId,
        potentialDuplicateIds: potentialDuplicates.map(
          (duplicate) => duplicate.entity.id
        ),
        similarityScores: potentialDuplicates.map(
          (duplicate) => duplicate.score
        ),
        status: "pending",
      });
      pendingEntryId = entryId;
    }

    return {
      highConfidenceMatches: highConfidence,
      pendingEntryId,
    };
  }

  async listPendingEntries(
    campaignId: string
  ): Promise<EntityDeduplicationEntry[]> {
    return await this.entityDAO.listDeduplicationEntries(campaignId);
  }

  async resolvePendingEntry(
    id: string,
    status: "merged" | "rejected" | "confirmed_unique",
    userDecision?: string
  ): Promise<void> {
    await this.entityDAO.updateDeduplicationEntry(id, {
      status,
      userDecision: userDecision ?? null,
      resolvedAt: new Date().toISOString(),
    });
  }
}
