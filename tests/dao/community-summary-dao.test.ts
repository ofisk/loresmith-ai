import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { CommunitySummaryDAO } from "@/dao/community-summary-dao";
import { createMockD1, createMockStmt } from "./helpers";

describe("CommunitySummaryDAO", () => {
	let dao: CommunitySummaryDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new CommunitySummaryDAO(mockDB);
	});

	describe("getLatestSummariesMapByCampaign", () => {
		it("uses window function for latest summary per community", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.getLatestSummariesMapByCampaign("camp-1");

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringMatching(
					/ROW_NUMBER\(\) OVER \(PARTITION BY cs\.community_id/
				)
			);
			expect(mockStmt.bind).toHaveBeenCalledWith("camp-1");
		});

		it("maps rows by community id", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({
				results: [
					{
						id: "s1",
						community_id: "com-1",
						level: 0,
						name: "Group A",
						summary_text: "Summary",
						key_entities: null,
						metadata: null,
						generated_at: "2024-01-01T00:00:00Z",
						updated_at: "2024-01-02T00:00:00Z",
					},
				],
			});

			const map = await dao.getLatestSummariesMapByCampaign("camp-1");

			expect(map.size).toBe(1);
			expect(map.get("com-1")?.summaryText).toBe("Summary");
			expect(map.get("com-1")?.name).toBe("Group A");
		});
	});
});
