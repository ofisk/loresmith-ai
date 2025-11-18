import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionDigestDAO } from "@/dao/session-digest-dao";
import type { D1Database } from "@cloudflare/workers-types";

describe("SessionDigestDAO", () => {
  let dao: SessionDigestDAO;
  let mockDB: D1Database;

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn(),
    } as unknown as D1Database;
    dao = new SessionDigestDAO(mockDB);
  });

  it("should create a session digest", async () => {
    const mockStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
    };
    (mockDB.prepare as any).mockReturnValue(mockStmt);

    await dao.createSessionDigest("test-id", {
      campaignId: "campaign-1",
      sessionNumber: 1,
      sessionDate: "2024-01-01",
      digestData: {
        last_session_recap: {
          key_events: [],
          state_changes: { factions: [], locations: [], npcs: [] },
          open_threads: [],
        },
        next_session_plan: {
          objectives_dm: [],
          probable_player_goals: [],
          beats: [],
          if_then_branches: [],
        },
        npcs_to_run: [],
        locations_in_focus: [],
        encounter_seeds: [],
        clues_and_revelations: [],
        treasure_and_rewards: [],
        todo_checklist: [],
      },
    });

    expect(mockDB.prepare).toHaveBeenCalled();
    expect(mockStmt.bind).toHaveBeenCalled();
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it("should get session digest by ID", async () => {
    const mockStmt = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: "test-id",
        campaign_id: "campaign-1",
        session_number: 1,
        session_date: "2024-01-01",
        digest_data: JSON.stringify({
          last_session_recap: {
            key_events: [],
            state_changes: { factions: [], locations: [], npcs: [] },
            open_threads: [],
          },
          next_session_plan: {
            objectives_dm: [],
            probable_player_goals: [],
            beats: [],
            if_then_branches: [],
          },
          npcs_to_run: [],
          locations_in_focus: [],
          encounter_seeds: [],
          clues_and_revelations: [],
          treasure_and_rewards: [],
          todo_checklist: [],
        }),
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      }),
    };
    (mockDB.prepare as any).mockReturnValue(mockStmt);

    const result = await dao.getSessionDigestById("test-id");

    expect(result).toBeTruthy();
    expect(result?.id).toBe("test-id");
    expect(result?.campaignId).toBe("campaign-1");
  });
});
