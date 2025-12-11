import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionDigestTemplateDAO } from "@/dao/session-digest-template-dao";
import type { D1Database } from "@cloudflare/workers-types";

describe("SessionDigestTemplateDAO", () => {
  let dao: SessionDigestTemplateDAO;
  let mockDB: D1Database;

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn(),
    } as unknown as D1Database;
    dao = new SessionDigestTemplateDAO(mockDB);
  });

  it("should create a template", async () => {
    const mockStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
    };
    (mockDB.prepare as any).mockReturnValue(mockStmt);

    await dao.createTemplate("test-id", {
      campaignId: "campaign-1",
      name: "Test Template",
      description: "Test description",
      templateData: {
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
});
