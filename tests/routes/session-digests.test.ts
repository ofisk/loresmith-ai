import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "hono";
import {
  handleCreateSessionDigest,
  handleGetSessionDigests,
} from "@/routes/session-digests";

const mockContext = {
  req: {
    param: vi.fn(),
    json: vi.fn(),
  },
  env: {
    DB: {} as any,
  },
  json: vi.fn(),
} as unknown as Context;

describe("session-digests routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle creating a session digest", async () => {
    (mockContext.req.param as any).mockReturnValue("campaign-1");
    (mockContext.req.json as any).mockResolvedValue({
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
    (mockContext as any).userAuth = { username: "test-user" };

    await handleCreateSessionDigest(mockContext as any);

    expect(mockContext.req.param).toHaveBeenCalledWith("campaignId");
  });

  it("should handle getting session digests", async () => {
    (mockContext.req.param as any).mockReturnValue("campaign-1");
    (mockContext as any).userAuth = { username: "test-user" };

    await handleGetSessionDigests(mockContext as any);

    expect(mockContext.req.param).toHaveBeenCalledWith("campaignId");
  });
});
