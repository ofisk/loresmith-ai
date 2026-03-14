import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionDigestDAO } from "@/dao/session-digest-dao";
import { createMockD1, createMockStmt } from "./helpers";

const validDigestData = {
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
};

describe("SessionDigestDAO", () => {
	let dao: SessionDigestDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new SessionDigestDAO(mockDB);
	});

	describe("createSessionDigest", () => {
		it("inserts digest with correct params", async () => {
			expect.hasAssertions();

			await dao.createSessionDigest("test-id", {
				campaignId: "campaign-1",
				sessionNumber: 1,
				sessionDate: "2024-01-01",
				digestData: validDigestData,
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			expect(mockStmt.bind).toHaveBeenCalled();
			expect(mockStmt.run).toHaveBeenCalled();
		});

		it("propagates database errors when run rejects", async () => {
			expect.hasAssertions();

			mockStmt.run.mockRejectedValue(new Error("D1 constraint violated"));

			await expect(
				dao.createSessionDigest("test-id", {
					campaignId: "campaign-1",
					sessionNumber: 1,
					sessionDate: "2024-01-01",
					digestData: validDigestData,
				})
			).rejects.toThrow(/Database/);
		});
	});

	describe("getSessionDigestById", () => {
		it("returns null when no row", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const result = await dao.getSessionDigestById("test-id");

			expect(result).toBeNull();
		});

		it("returns mapped digest when found", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue({
				id: "test-id",
				campaign_id: "campaign-1",
				session_number: 1,
				session_date: "2024-01-01",
				digest_data: JSON.stringify(validDigestData),
				status: "draft",
				quality_score: null,
				review_notes: null,
				generated_by_ai: 0,
				template_id: null,
				source_type: "manual",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			const result = await dao.getSessionDigestById("test-id");

			expect(result).toBeTruthy();
			expect(result?.id).toBe("test-id");
			expect(result?.campaignId).toBe("campaign-1");
			expect(result?.sessionNumber).toBe(1);
			expect(result?.digestData).toEqual(validDigestData);
		});

		it("returns digest with fallback structure when digest_data JSON is invalid", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue({
				id: "test-id",
				campaign_id: "campaign-1",
				session_number: 1,
				session_date: "2024-01-01",
				digest_data: "not valid json {{{",
				status: "draft",
				quality_score: null,
				review_notes: null,
				generated_by_ai: 0,
				template_id: null,
				source_type: "manual",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			const result = await dao.getSessionDigestById("test-id");

			expect(result).toBeTruthy();
			expect(result?.id).toBe("test-id");
			expect(result?.digestData).toHaveProperty("last_session_recap");
			expect(result?.digestData).toHaveProperty("next_session_plan");
		});
	});
});
