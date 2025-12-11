import type {
  D1Database,
  VectorizeIndex,
  R2Bucket,
} from "@cloudflare/workers-types";
import { ChangelogArchiveService } from "@/services/graph/changelog-archive-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import type { WorldStateOverlaySnapshot } from "@/services/graph/world-state-changelog-service";
import { PlanningContextService } from "./planning-context-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { getDAOFactory } from "@/dao/dao-factory";
import type {
  HistoricalContext,
  HistoricalQueryInput,
} from "@/types/changelog-archive";
import type { WorldStateChangelogEntry } from "@/types/world-state";

export interface HistoricalContextServiceOptions {
  db: D1Database;
  r2: R2Bucket;
  vectorize?: VectorizeIndex;
  openaiApiKey?: string;
  env?: any;
}

export class HistoricalContextService {
  private readonly archiveService: ChangelogArchiveService;
  private readonly worldStateService: WorldStateChangelogService;
  private readonly planningContextService?: PlanningContextService;
  private readonly entityEmbeddingService?: EntityEmbeddingService;
  private readonly entityGraphService: EntityGraphService;
  private readonly env?: any;

  constructor(options: HistoricalContextServiceOptions) {
    this.env = options.env;
    this.archiveService = new ChangelogArchiveService({
      db: options.db,
      r2: options.r2,
      vectorize: options.vectorize,
      openaiApiKey: options.openaiApiKey,
      env: options.env,
    });

    this.worldStateService = new WorldStateChangelogService({
      db: options.db,
    });

    if (options.vectorize && options.openaiApiKey) {
      this.planningContextService = new PlanningContextService(
        options.db,
        options.vectorize,
        options.openaiApiKey,
        options.env
      );
      this.entityEmbeddingService = new EntityEmbeddingService(
        options.vectorize
      );
    }

    const daoFactory = getDAOFactory(options.env);
    this.entityGraphService = new EntityGraphService(daoFactory.entityDAO);
  }

  /**
   * Query historical state at a specific point in time
   */
  async queryHistoricalState(
    campaignId: string,
    input: HistoricalQueryInput
  ): Promise<HistoricalContext> {
    const { sessionId, timestamp, query } = input;

    if (!sessionId && !timestamp) {
      throw new Error("Either sessionId or timestamp must be provided");
    }

    // Get historical overlay up to the specified point
    const historicalOverlay = await this.getHistoricalOverlay(
      campaignId,
      sessionId ?? undefined,
      timestamp ?? undefined
    );

    // Query current graph using semantic search
    const entities: HistoricalContext["entities"] = [];
    const relationships: HistoricalContext["relationships"] = [];

    if (query && this.entityEmbeddingService && this.planningContextService) {
      // Generate query embedding
      const [queryEmbedding] =
        await this.planningContextService.generateEmbeddings([query]);

      // Find similar entities
      const similarEntities =
        await this.entityEmbeddingService.findSimilarByEmbedding(
          queryEmbedding,
          {
            campaignId,
            topK: 20,
          }
        );

      const daoFactory = getDAOFactory(this.env);

      for (const similar of similarEntities) {
        if (similar.score < 0.3) continue;

        const entity = await daoFactory.entityDAO.getEntityById(
          similar.entityId
        );
        if (!entity || entity.campaignId !== campaignId) continue;

        // Get relationships
        const entityRelationships =
          await this.entityGraphService.getRelationshipsForEntity(
            campaignId,
            entity.id
          );

        // Apply historical overlay to entity
        const historicalState = historicalOverlay.entityState[entity.id];

        entities.push({
          id: entity.id,
          name: entity.name,
          entityType: entity.entityType,
          content:
            typeof entity.content === "string"
              ? entity.content
              : JSON.stringify(entity.content || {}),
          historicalState,
        });

        // Apply historical overlay to relationships
        for (const rel of entityRelationships) {
          const relKey = this.getRelationshipKey(
            rel.fromEntityId,
            rel.toEntityId
          );
          const relHistoricalState =
            historicalOverlay.relationshipState[relKey];

          relationships.push({
            fromEntityId: rel.fromEntityId,
            toEntityId: rel.toEntityId,
            relationshipType: rel.relationshipType,
            historicalState: relHistoricalState,
          });
        }
      }
    }

    // Determine timestamp for result
    let resultTimestamp: string;
    if (timestamp) {
      resultTimestamp = timestamp;
    } else if (sessionId) {
      // Find the latest timestamp for entries with this session ID
      const entries = await this.archiveService.getArchivedEntries(campaignId, {
        campaignSessionId: sessionId,
      });
      if (entries.length > 0) {
        const timestamps = entries.map((e) => e.timestamp).sort();
        resultTimestamp = timestamps[timestamps.length - 1];
      } else {
        resultTimestamp = new Date().toISOString();
      }
    } else {
      resultTimestamp = new Date().toISOString();
    }

    return {
      campaignId,
      sessionId: sessionId ?? null,
      timestamp: resultTimestamp,
      entities,
      relationships,
      overlay: historicalOverlay,
    };
  }

  /**
   * Get historical overlay snapshot at a specific point in time
   */
  async getHistoricalOverlay(
    campaignId: string,
    sessionId?: number,
    timestamp?: string
  ): Promise<WorldStateOverlaySnapshot> {
    // Get archived entries up to the specified point
    const archivedEntries = await this.archiveService.getArchivedEntries(
      campaignId,
      {
        campaignSessionId: sessionId,
        toTimestamp: timestamp,
      }
    );

    // Also get unarchived entries (not yet applied to graph)
    const unarchivedEntries = await this.worldStateService.listChangelogs(
      campaignId,
      {
        campaignSessionId: sessionId,
        toTimestamp: timestamp,
        appliedToGraph: false,
      }
    );

    // Combine and sort all entries chronologically
    const allEntries: WorldStateChangelogEntry[] = [
      ...archivedEntries,
      ...unarchivedEntries,
    ].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Build overlay snapshot from entries
    return this.reduceEntriesToOverlay(allEntries);
  }

  /**
   * Apply historical overlay to current entities
   */
  applyHistoricalOverlay<T extends { id: string }>(
    entity: T,
    overlay: WorldStateOverlaySnapshot
  ): T & { historicalState?: any } {
    const state = overlay.entityState[entity.id];
    if (!state) {
      return entity;
    }
    return { ...entity, historicalState: state };
  }

  /**
   * Search archived changelog entries using semantic search
   */
  async searchArchivedChangelogs(
    campaignId: string,
    query: string,
    options: {
      sessionId?: number;
      fromTimestamp?: string;
      toTimestamp?: string;
      limit?: number;
    } = {}
  ): Promise<WorldStateChangelogEntry[]> {
    if (!this.planningContextService || !this.entityEmbeddingService) {
      throw new Error(
        "Semantic search requires Vectorize and OpenAI API key to be configured"
      );
    }

    // Generate query embedding
    const [queryEmbedding] =
      await this.planningContextService.generateEmbeddings([query]);

    // Search Vectorize for archived changelog entries
    // Access vectorize through a method that doesn't require protected access
    if (
      !this.planningContextService ||
      !("vectorize" in this.planningContextService)
    ) {
      throw new Error("PlanningContextService vectorize not available");
    }
    const vectorize = (this.planningContextService as any).vectorize;
    const vectorResults = await vectorize.query(queryEmbedding, {
      topK: options.limit ?? 20,
      returnMetadata: true,
      filter: {
        campaignId,
        contentType: "changelog",
        archived: "true",
      },
    });

    const matches = vectorResults.matches || [];
    const archiveKeys = new Set<string>();

    // Extract archive keys from Vectorize results
    for (const match of matches) {
      const metadata = match.metadata;
      if (metadata?.archiveKey) {
        archiveKeys.add(metadata.archiveKey as string);
      }
    }

    // Load entries from R2 using archive keys
    const allEntries: WorldStateChangelogEntry[] = [];
    for (const archiveKey of archiveKeys) {
      try {
        // We need to extract entries from the archive - use the archive service
        // For now, get all entries and filter by relevance
        const entries = await this.archiveService.getArchivedEntries(
          campaignId,
          {
            campaignSessionId: options.sessionId,
            fromTimestamp: options.fromTimestamp,
            toTimestamp: options.toTimestamp,
          }
        );
        allEntries.push(...entries);
      } catch (error) {
        console.error(
          `[HistoricalContext] Failed to load archive ${archiveKey}:`,
          error
        );
      }
    }

    // Remove duplicates by ID
    const uniqueEntries = new Map<string, WorldStateChangelogEntry>();
    for (const entry of allEntries) {
      uniqueEntries.set(entry.id, entry);
    }

    // Filter by timestamp constraints if specified
    let filteredEntries = Array.from(uniqueEntries.values());
    if (options.fromTimestamp) {
      filteredEntries = filteredEntries.filter(
        (e) => e.timestamp >= options.fromTimestamp!
      );
    }
    if (options.toTimestamp) {
      filteredEntries = filteredEntries.filter(
        (e) => e.timestamp <= options.toTimestamp!
      );
    }

    return filteredEntries.slice(0, options.limit ?? 20);
  }

  /**
   * Reduce changelog entries to overlay snapshot
   * (Same logic as WorldStateChangelogService.reduceEntriesToOverlay)
   */
  private reduceEntriesToOverlay(
    entries: WorldStateChangelogEntry[]
  ): WorldStateOverlaySnapshot {
    const snapshot: WorldStateOverlaySnapshot = {
      entityState: {},
      relationshipState: {},
      newEntities: {},
    };

    for (const entry of entries) {
      for (const update of entry.payload.entity_updates || []) {
        if (!update?.entity_id) continue;
        snapshot.entityState[update.entity_id] = {
          entityId: update.entity_id,
          status: (update as any).status,
          description: (update as any).description,
          metadata: (update as any).metadata,
          timestamp: entry.timestamp,
          sourceEntryId: entry.id,
        };
      }

      for (const update of entry.payload.relationship_updates || []) {
        if (!update?.from || !update?.to) continue;
        const key = this.getRelationshipKey(update.from, update.to);
        snapshot.relationshipState[key] = {
          from: update.from,
          to: update.to,
          newStatus: (update as any).new_status,
          description: (update as any).description,
          metadata: (update as any).metadata,
          timestamp: entry.timestamp,
          sourceEntryId: entry.id,
        };
      }

      for (const entity of entry.payload.new_entities || []) {
        if (!entity?.entity_id) continue;
        snapshot.newEntities[entity.entity_id] = entity;
      }
    }

    return snapshot;
  }

  private getRelationshipKey(from: string, to: string): string {
    return `${from}::${to}`;
  }
}
