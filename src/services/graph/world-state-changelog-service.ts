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
import type { EntityImportanceService } from "./entity-importance-service";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { TelemetryService } from "@/services/telemetry/telemetry-service";

export interface WorldStateChangelogServiceOptions {
  db: D1Database;
  dao?: WorldStateChangelogDAO;
  importanceService?: EntityImportanceService;
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
  private readonly importanceService?: EntityImportanceService;
  private telemetryService: TelemetryService | null = null;

  constructor(options: WorldStateChangelogServiceOptions) {
    this.dao = options.dao ?? new WorldStateChangelogDAO(options.db);
    this.importanceService = options.importanceService;
    try {
      this.telemetryService = new TelemetryService(
        new TelemetryDAO(options.db)
      );
    } catch (error) {
      console.warn(
        "[WorldStateChangelog] Failed to initialize telemetry service:",
        error
      );
    }
  }

  /**
   * Normalize entity IDs to ensure they are campaign-scoped.
   * Entity IDs should be in the format: <campaignId>_<entityName>
   */
  private normalizeEntityId(campaignId: string, entityId: string): string {
    if (!entityId) {
      return entityId;
    }
    // If already campaign-scoped, return as-is
    if (entityId.startsWith(`${campaignId}_`)) {
      return entityId;
    }
    // Otherwise, add campaign prefix
    return `${campaignId}_${entityId}`;
  }

  /**
   * Normalize all entity IDs in a changelog payload to be campaign-scoped.
   */
  private normalizePayloadEntityIds(
    campaignId: string,
    payload: WorldStateChangelogPayload
  ): WorldStateChangelogPayload {
    return {
      ...payload,
      entity_updates: (payload.entity_updates || []).map((update) => ({
        ...update,
        entity_id: update.entity_id
          ? this.normalizeEntityId(campaignId, update.entity_id)
          : update.entity_id,
      })),
      relationship_updates: (payload.relationship_updates || []).map(
        (update) => ({
          ...update,
          from: update.from
            ? this.normalizeEntityId(campaignId, update.from)
            : update.from,
          to: update.to
            ? this.normalizeEntityId(campaignId, update.to)
            : update.to,
        })
      ),
      new_entities: (payload.new_entities || []).map((entity) => ({
        ...entity,
        entity_id: entity.entity_id
          ? this.normalizeEntityId(campaignId, entity.entity_id)
          : entity.entity_id,
      })),
    };
  }

  /**
   * Validate a changelog payload and create a new entry.
   */
  async recordChangelog(
    campaignId: string,
    payload: WorldStateChangelogPayload
  ): Promise<WorldStateChangelogEntry> {
    this.validatePayload(payload);

    // Normalize entity IDs to ensure they are campaign-scoped
    const normalizedPayload = this.normalizePayloadEntityIds(
      campaignId,
      payload
    );

    const impactScore = await this.calculateImpactScore(
      campaignId,
      normalizedPayload
    );
    const entry: CreateWorldStateChangelogInput = {
      id: generateId(),
      campaignId,
      campaignSessionId: normalizedPayload.campaign_session_id,
      timestamp: normalizedPayload.timestamp,
      payload: normalizedPayload,
      impactScore,
    };

    await this.dao.createEntry(entry);

    // Calculate changelog size in bytes (JSON string length)
    const payloadSizeBytes = new TextEncoder().encode(
      JSON.stringify(normalizedPayload)
    ).length;

    // Record changelog metrics (fire and forget)
    const telemetryPromises = [
      // Record entry count (always 1 for a new entry)
      this.telemetryService
        ?.recordChangelogEntryCount(1, {
          campaignId,
          metadata: {
            entryId: entry.id,
            impactScore,
            sessionId: normalizedPayload.campaign_session_id,
          },
        })
        .catch((error) => {
          console.error(
            "[WorldStateChangelog] Failed to record entry count:",
            error
          );
        }),

      // Record changelog size
      this.telemetryService
        ?.recordChangelogSize(payloadSizeBytes, {
          campaignId,
          metadata: {
            entryId: entry.id,
            impactScore,
          },
        })
        .catch((error) => {
          console.error("[WorldStateChangelog] Failed to record size:", error);
        }),
    ];

    await Promise.allSettled(telemetryPromises);

    // Return the normalized entry as stored
    const [created] = await this.dao.listEntriesForCampaign(campaignId, {
      fromTimestamp: normalizedPayload.timestamp,
      toTimestamp: normalizedPayload.timestamp,
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
   * Calculate impact score based on entity importance and change types.
   * Formula: impact_score = change_type_weight × entity_importance × relationship_weight
   */
  private async calculateImpactScore(
    campaignId: string,
    payload: WorldStateChangelogPayload
  ): Promise<number> {
    if (!this.importanceService) {
      return this.calculateSimpleImpactScore(payload);
    }

    const changeTypeWeights = {
      entity_deleted: 3.0,
      entity_modified: 1.5,
      relationship_changed: 1.0,
      new_entity: 1.2,
    };

    let totalImpact = 0;

    for (const update of payload.entity_updates || []) {
      if (!update.entity_id) continue;

      const importance = await this.importanceService.getEntityImportance(
        campaignId,
        update.entity_id,
        true
      );

      const importanceMultiplier = importance / 100;
      const changeType = (update as any).change_type || "entity_modified";
      const weight =
        changeTypeWeights[changeType as keyof typeof changeTypeWeights] ??
        changeTypeWeights.entity_modified;

      totalImpact += weight * importanceMultiplier;
    }

    for (const update of payload.relationship_updates || []) {
      if (!update.from || !update.to) continue;

      const fromImportance = await this.importanceService.getEntityImportance(
        campaignId,
        update.from,
        true
      );
      const toImportance = await this.importanceService.getEntityImportance(
        campaignId,
        update.to,
        true
      );

      const avgImportance = (fromImportance + toImportance) / 2;
      const importanceMultiplier = avgImportance / 100;
      const relationshipWeight = 1.0 + (avgImportance / 100) * 0.5;

      totalImpact +=
        changeTypeWeights.relationship_changed *
        importanceMultiplier *
        relationshipWeight;
    }

    for (const entity of payload.new_entities || []) {
      if (!entity.entity_id) continue;

      const importance = await this.importanceService.getEntityImportance(
        campaignId,
        entity.entity_id,
        true
      );

      const importanceMultiplier = importance / 100;

      totalImpact += changeTypeWeights.new_entity * importanceMultiplier;
    }

    return Math.max(0, totalImpact);
  }

  private calculateSimpleImpactScore(
    payload: WorldStateChangelogPayload
  ): number {
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
