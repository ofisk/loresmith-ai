import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";

const mockDB = {
  prepare: vi.fn(),
} as unknown as D1Database;

describe("WorldStateChangelogDAO", () => {
  let dao: WorldStateChangelogDAO;
  let mockStatement: {
    bind: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(),
      all: vi.fn(),
    };
    (mockDB.prepare as any).mockReturnValue(mockStatement);
    dao = new WorldStateChangelogDAO(mockDB);
  });

  it("creates changelog entries with serialized payloads", async () => {
    await dao.createEntry({
      id: "entry-1",
      campaignId: "campaign-123",
      campaignSessionId: 42,
      timestamp: "2025-01-01T00:00:00Z",
      payload: {
        campaign_session_id: 42,
        timestamp: "2025-01-01T00:00:00Z",
        entity_updates: [],
        relationship_updates: [],
        new_entities: [],
      },
      impactScore: 3.5,
    });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO world_state_changelog")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith(
      "entry-1",
      "campaign-123",
      42,
      "2025-01-01T00:00:00Z",
      JSON.stringify({
        campaign_session_id: 42,
        timestamp: "2025-01-01T00:00:00Z",
        entity_updates: [],
        relationship_updates: [],
        new_entities: [],
      }),
      3.5
    );
    expect(mockStatement.run).toHaveBeenCalled();
  });

  it("lists changelog entries and maps records to overlay-friendly shape", async () => {
    const record = {
      id: "entry-2",
      campaign_id: "campaign-123",
      campaign_session_id: 99,
      timestamp: "2025-02-02T10:00:00Z",
      changelog_data: JSON.stringify({
        campaign_session_id: 99,
        timestamp: "2025-02-02T10:00:00Z",
        entity_updates: [{ entity_id: "npc-1", status: "missing" }],
        relationship_updates: [],
        new_entities: [],
      }),
      impact_score: 1.2,
      applied_to_graph: 0,
      created_at: "2025-02-02T10:05:00Z",
    };

    mockStatement.all.mockResolvedValue({ results: [record] });

    const entries = await dao.listEntriesForCampaign("campaign-123", {
      campaignSessionId: 99,
      fromTimestamp: "2025-02-01T00:00:00Z",
      toTimestamp: "2025-02-03T00:00:00Z",
      appliedToGraph: false,
      limit: 10,
      offset: 0,
    });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("WHERE campaign_id = ?")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith(
      "campaign-123",
      99,
      "2025-02-01T00:00:00Z",
      "2025-02-03T00:00:00Z",
      0,
      10,
      0
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "entry-2",
      campaignId: "campaign-123",
      campaignSessionId: 99,
      payload: expect.objectContaining({
        entity_updates: [{ entity_id: "npc-1", status: "missing" }],
      }),
      appliedToGraph: false,
    });
  });

  it("marks entries as applied", async () => {
    await dao.markEntriesApplied(["entry-1", "entry-2"]);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE world_state_changelog")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("entry-1", "entry-2");
    expect(mockStatement.run).toHaveBeenCalled();
  });
});
