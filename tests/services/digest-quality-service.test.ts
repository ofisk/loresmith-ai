import { describe, it, expect } from "vitest";
import { DigestQualityService } from "@/services/session-digest/digest-quality-service";
import type { SessionDigestData } from "@/types/session-digest";

describe("DigestQualityService", () => {
  const service = new DigestQualityService();

  describe("checkCompleteness", () => {
    it("should give high score for complete digest", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: ["Event 1", "Event 2"],
          state_changes: {
            factions: ["Faction change"],
            locations: [],
            npcs: ["NPC - active: description"],
          },
          open_threads: ["Thread 1"],
        },
        next_session_plan: {
          objectives_dm: ["Objective 1"],
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkCompleteness(digest);
      expect(result.score).toBeGreaterThan(5);
      expect(result.issues.length).toBe(0);
    });

    it("should give low score for incomplete digest", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: [],
          state_changes: {
            factions: [],
            locations: [],
            npcs: [],
          },
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkCompleteness(digest);
      expect(result.score).toBeLessThan(5);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe("checkSpecificity", () => {
    it("should detect vague entries", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: ["Things happened", "Stuff occurred"],
          state_changes: {
            factions: [],
            locations: [],
            npcs: [],
          },
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkSpecificity(digest);
      expect(result.score).toBeLessThan(8);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("should give high score for specific entries", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: [
            "The party discovered a hidden chamber beneath the old tavern containing ancient artifacts",
          ],
          state_changes: {
            factions: [],
            locations: [],
            npcs: [],
          },
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkSpecificity(digest);
      expect(result.score).toBeGreaterThan(8);
    });
  });

  describe("checkConsistency", () => {
    it("should detect duplicate entries", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: ["Event 1", "Event 1"],
          state_changes: {
            factions: [],
            locations: [],
            npcs: [],
          },
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkConsistency(digest);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("should detect inconsistent NPC format", () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: [],
          state_changes: {
            factions: [],
            locations: [],
            npcs: ["Invalid format without dash"],
          },
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
      };

      // biome-ignore lint/complexity/useLiteralKeys: Private method access required for testing
      const result = (service as any).checkConsistency(digest);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe("validateDigestQuality", () => {
    it("should return quality result with all checks", async () => {
      const digest: SessionDigestData = {
        last_session_recap: {
          key_events: ["Event 1"],
          state_changes: {
            factions: ["Faction change"],
            locations: [],
            npcs: ["NPC - active: description"],
          },
          open_threads: [],
        },
        next_session_plan: {
          objectives_dm: ["Objective"],
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
      };

      const result = await service.validateDigestQuality(digest);
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("completeness");
      expect(result).toHaveProperty("specificity");
      expect(result).toHaveProperty("consistency");
      expect(result).toHaveProperty("relevance");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });
  });
});
