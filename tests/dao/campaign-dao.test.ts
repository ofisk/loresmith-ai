import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { CampaignDAO } from "@/dao/campaign-dao";
import { createMockD1, createMockStmt } from "./helpers";

describe("CampaignDAO", () => {
	let dao: CampaignDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new CampaignDAO(mockDB);
	});

	describe("createCampaign", () => {
		it("calls execute with correct params", async () => {
			expect.hasAssertions();

			await dao.createCampaign(
				"camp-1",
				"My Campaign",
				"user1",
				"A great game"
			);

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("insert into campaigns")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith(
				"camp-1",
				"My Campaign",
				"user1",
				"A great game",
				null
			);
			expect(mockStmt.run).toHaveBeenCalled();
		});

		it("propagates database errors", async () => {
			expect.hasAssertions();

			mockStmt.run.mockRejectedValue(new Error("D1 constraint violated"));

			await expect(dao.createCampaign("id", "n", "u")).rejects.toThrow(
				/Database/
			);
		});
	});

	describe("getCampaignsByUser", () => {
		it("returns empty array when no campaigns", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			const result = await dao.getCampaignsByUser("user1");

			expect(result).toEqual([]);
			expect(mockStmt.bind).toHaveBeenCalledWith("user1");
		});

		it("propagates database errors when all rejects", async () => {
			expect.hasAssertions();

			mockStmt.all.mockRejectedValue(new Error("D1 query failed"));

			await expect(dao.getCampaignsByUser("user1")).rejects.toThrow(
				/Database query failed/
			);
		});

		it("returns campaigns from results", async () => {
			expect.hasAssertions();

			const rows = [
				{
					id: "c1",
					name: "Campaign One",
					username: "user1",
					description: "First",
					campaignRagBasePath: null,
					metadata: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
			];
			mockStmt.all.mockResolvedValue({ results: rows });

			const result = await dao.getCampaignsByUser("user1");

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("c1");
			expect(result[0].name).toBe("Campaign One");
		});
	});

	describe("getCampaignByIdWithMapping", () => {
		it("returns null when no row", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const result = await dao.getCampaignByIdWithMapping("c1", "user1");

			expect(result).toBeNull();
			expect(mockStmt.bind).toHaveBeenCalledWith("c1", "user1");
		});

		it("propagates database errors when first rejects", async () => {
			expect.hasAssertions();

			mockStmt.first.mockRejectedValue(new Error("D1 query failed"));

			await expect(
				dao.getCampaignByIdWithMapping("c1", "user1")
			).rejects.toThrow(/Database query failed/);
		});

		it("returns mapped campaign when found", async () => {
			expect.hasAssertions();

			const row = {
				campaignId: "c1",
				name: "My Campaign",
				description: "Desc",
				campaignRagBasePath: "/rag",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				metadata: null,
			};
			mockStmt.first.mockResolvedValue(row);

			const result = await dao.getCampaignByIdWithMapping("c1", "user1");

			expect(result).not.toBeNull();
			expect(result?.campaignId).toBe("c1");
			expect(result?.name).toBe("My Campaign");
		});
	});
});
