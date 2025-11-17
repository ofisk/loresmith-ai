import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorldStateChangelogService,
  type WorldStateOverlaySnapshot,
} from "@/services/graph/world-state-changelog-service";
import type { WorldStateChangelogEntry } from "@/types/world-state";
import type { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";

describe("WorldStateChangelogService", () => {
  let mockDao: Pick<
    WorldStateChangelogDAO,
    "createEntry" | "listEntriesForCampaign" | "markEntriesApplied"
  >;
  let service: WorldStateChangelogService;

  beforeEach(() => {
    mockDao = {
      createEntry: vi.fn(),
      listEntriesForCampaign: vi.fn(),
      markEntriesApplied: vi.fn(),
    };
    service = new WorldStateChangelogService({
      db: {} as D1Database,
      dao: mockDao as WorldStateChangelogDAO,
    });
  });

  it("records changelog entries with computed impact score", async () => {
    const payload = {
      campaign_session_id: 7,
      timestamp: "2025-03-10T12:00:00Z",
      entity_updates: [{ entity_id: "npc-1", status: "wounded" }],
      relationship_updates: [],
      new_entities: [],
    };
    const normalizedEntry: WorldStateChangelogEntry = {
      id: "entry-1",
      campaignId: "campaign-42",
      campaignSessionId: 7,
      timestamp: "2025-03-10T12:00:00Z",
      payload,
      impactScore: 1,
      appliedToGraph: false,
      createdAt: "2025-03-10T12:01:00Z",
    };

    (mockDao.listEntriesForCampaign as any).mockResolvedValue([
      normalizedEntry,
    ]);

    const result = await service.recordChangelog("campaign-42", payload);

    expect(mockDao.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-42",
        payload,
        impactScore: expect.any(Number),
      })
    );
    expect(result).toEqual(normalizedEntry);
  });

  it("builds overlay snapshots that respect the latest updates", async () => {
    const entries: WorldStateChangelogEntry[] = [
      {
        id: "entry-1",
        campaignId: "camp",
        campaignSessionId: 1,
        timestamp: "2025-04-01T10:00:00Z",
        payload: {
          campaign_session_id: 1,
          timestamp: "2025-04-01T10:00:00Z",
          entity_updates: [{ entity_id: "npc-1", status: "injured" }],
          relationship_updates: [
            { from: "npc-1", to: "npc-2", new_status: "allied" },
          ],
          new_entities: [{ entity_id: "npc-3", name: "New Ally" }],
        },
        impactScore: 3,
        appliedToGraph: false,
        createdAt: "2025-04-01T10:01:00Z",
      },
      {
        id: "entry-2",
        campaignId: "camp",
        campaignSessionId: 2,
        timestamp: "2025-04-02T15:00:00Z",
        payload: {
          campaign_session_id: 2,
          timestamp: "2025-04-02T15:00:00Z",
          entity_updates: [{ entity_id: "npc-1", status: "recovered" }],
          relationship_updates: [
            { from: "npc-1", to: "npc-2", new_status: "hostile" },
          ],
          new_entities: [],
        },
        impactScore: 2,
        appliedToGraph: false,
        createdAt: "2025-04-02T15:01:00Z",
      },
    ];

    (mockDao.listEntriesForCampaign as any).mockResolvedValue(entries);

    const overlay = (await service.getOverlaySnapshot(
      "camp"
    )) as WorldStateOverlaySnapshot;

    expect(overlay.entityState["npc-1"]).toMatchObject({
      status: "recovered",
      sourceEntryId: "entry-2",
    });
    expect(overlay.relationshipState["npc-1::npc-2"]).toMatchObject({
      newStatus: "hostile",
      sourceEntryId: "entry-2",
    });
    expect(overlay.newEntities["npc-3"]).toMatchObject({
      entity_id: "npc-3",
      name: "New Ally",
    });
  });

  it("applies overlays to entities and relationships", () => {
    const overlay: WorldStateOverlaySnapshot = {
      entityState: {
        "npc-1": {
          entityId: "npc-1",
          status: "missing",
          description: "Left town",
          metadata: { note: "search ongoing" },
          timestamp: "2025-05-01T00:00:00Z",
          sourceEntryId: "entry-3",
        },
      },
      relationshipState: {
        "npc-1::npc-2": {
          from: "npc-1",
          to: "npc-2",
          newStatus: "hostile",
          description: "Argument escalated",
          metadata: undefined,
          timestamp: "2025-05-01T00:00:00Z",
          sourceEntryId: "entry-3",
        },
      },
      newEntities: {},
    };

    const entity = service.applyEntityOverlay(
      { id: "npc-1", name: "Scout" },
      overlay
    );
    expect(entity.worldState).toMatchObject({ status: "missing" });

    const relationships = service.applyRelationshipOverlay(
      [
        {
          id: "rel-1",
          campaignId: "camp",
          fromEntityId: "npc-1",
          toEntityId: "npc-2",
          relationshipType: "allied",
          createdAt: "",
          updatedAt: "",
        },
      ],
      overlay
    );
    expect(relationships[0].worldState).toMatchObject({
      newStatus: "hostile",
    });
  });
});
