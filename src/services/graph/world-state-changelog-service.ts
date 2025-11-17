import { generateId } from "ai";
import type { D1Database } from "@cloudflare/workers-types";
import {
  type CreateWorldStateChangelogInput,
  WorldStateChangelogDAO,
} from "@/dao/world-state-changelog-dao";
import type {
  WorldStateChangelogEntry,
  WorldStateChangelogPayload,
  WorldStateNewEntity,
} from "@/types/world-state";

export interface WorldStateChangelogServiceOptions {
  db: D1Database;
  dao?: WorldStateChangelogDAO;
}

export interface WorldStateEntityOverlay {
  entityId: string;
  status?: string;
  description?: string;
  metadata?: unknown;
  timestamp: string;
  sourceEntryId: string;
}

export interface WorldStateRelationshipOverlay {
  from: string;
  to: string;
  newStatus?: string;
  description?: string;
  metadata?: unknown;
  timestamp: string;
  sourceEntryId: string;
}

export interface WorldStateOverlaySnapshot {
  entityState: Record<string, WorldStateEntityOverlay>;
  relationshipState: Record<string, WorldStateRelationshipOverlay>;
  newEntities: Record<string, WorldStateNewEntity>;
}

export class WorldStateChangelogService {
  private readonly dao: WorldStateChangelogDAO;

  constructor(options: WorldStateChangelogServiceOptions) {
    this.dao = options.dao ?? new WorldStateChangelogDAO(options.db);
  }

  /**
   * Validate a changelog payload and create a new entry.
   */
  async recordChangelog(
    campaignId: string,
    payload: WorldStateChangelogPayload
  ): Promise<WorldStateChangelogEntry> {
    this.validatePayload(payload);

    const impactScore = this.calculateImpactScore(payload);
    const entry: CreateWorldStateChangelogInput = {
      id: generateId(),
      campaignId,
      campaignSessionId: payload.campaign_session_id,
      timestamp: payload.timestamp,
      payload,
      impactScore,
    };

    await this.dao.createEntry(entry);

    // Return the normalized entry as stored
    const [created] = await this.dao.listEntriesForCampaign(campaignId, {
      fromTimestamp: payload.timestamp,
      toTimestamp: payload.timestamp,
      limit: 1,
    });
    return created;
  }

  async listChangelogs(
    campaignId: string,
    options: {
      campaignSessionId?: number;
      fromTimestamp?: string;
      toTimestamp?: string;
      appliedToGraph?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<WorldStateChangelogEntry[]> {
    return this.dao.listEntriesForCampaign(campaignId, options);
  }

  async markApplied(ids: string[]): Promise<void> {
    await this.dao.markEntriesApplied(ids);
  }

  async getOverlaySnapshot(
    campaignId: string,
    options: { toTimestamp?: string } = {}
  ): Promise<WorldStateOverlaySnapshot> {
    const entries = await this.dao.listEntriesForCampaign(campaignId, {
      toTimestamp: options.toTimestamp,
    });
    return this.reduceEntriesToOverlay(entries);
  }

  applyEntityOverlay<T extends { id: string }>(
    entity: T,
    overlay: WorldStateOverlaySnapshot
  ): T & { worldState?: WorldStateEntityOverlay } {
    const state = overlay.entityState[entity.id];
    if (!state) {
      return entity;
    }
    return { ...entity, worldState: state };
  }

  applyRelationshipOverlay<
    T extends { fromEntityId: string; toEntityId: string },
  >(
    relationships: T[],
    overlay: WorldStateOverlaySnapshot
  ): Array<T & { worldState?: WorldStateRelationshipOverlay }> {
    return relationships.map((relationship) => {
      const key = this.getRelationshipKey(
        relationship.fromEntityId,
        relationship.toEntityId
      );
      const state = overlay.relationshipState[key];
      if (!state) {
        return relationship;
      }
      return {
        ...relationship,
        worldState: state,
      };
    });
  }

  /**
   * Lightweight payload validation to enforce basic shape.
   */
  private validatePayload(payload: WorldStateChangelogPayload): void {
    if (!payload.timestamp) {
      throw new Error("WorldStateChangelogPayload.timestamp is required");
    }

    if (!Array.isArray(payload.entity_updates)) {
      throw new Error(
        "WorldStateChangelogPayload.entity_updates must be an array"
      );
    }

    if (!Array.isArray(payload.relationship_updates)) {
      throw new Error(
        "WorldStateChangelogPayload.relationship_updates must be an array"
      );
    }

    if (!Array.isArray(payload.new_entities)) {
      throw new Error(
        "WorldStateChangelogPayload.new_entities must be an array"
      );
    }
  }

  /**
   * Simple heuristic: count of changes, weighted by type.
   */
  private calculateImpactScore(payload: WorldStateChangelogPayload): number {
    const entityWeight = 1;
    const relationshipWeight = 1.5;
    const newEntityWeight = 1.2;

    const score =
      payload.entity_updates.length * entityWeight +
      payload.relationship_updates.length * relationshipWeight +
      payload.new_entities.length * newEntityWeight;

    return score;
  }
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
