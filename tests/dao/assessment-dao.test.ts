import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { AssessmentDAO } from "@/dao/assessment-dao";
import { createMockD1, createMockStmt } from "./helpers";

describe("AssessmentDAO", () => {
	let dao: AssessmentDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new AssessmentDAO(mockDB);
	});

	describe("getCampaignCount", () => {
		it("returns 0 when no campaigns", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const count = await dao.getCampaignCount("user1");

			expect(count).toBe(0);
			expect(mockStmt.bind).toHaveBeenCalledWith("user1");
		});

		it("returns count from result", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue({ count: 5 });

			const count = await dao.getCampaignCount("user1");

			expect(count).toBe(5);
		});
	});

	describe("getResourceCount", () => {
		it("returns 0 when no resources", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const count = await dao.getResourceCount("user1");

			expect(count).toBe(0);
		});

		it("returns count from result", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue({ count: 10 });

			const count = await dao.getResourceCount("user1");

			expect(count).toBe(10);
		});
	});

	describe("getRecentActivity", () => {
		it("returns empty array when no activity", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			const activity = await dao.getRecentActivity("user1");

			expect(activity).toEqual([]);
		});

		it("returns results", async () => {
			expect.hasAssertions();

			const results = [
				{
					type: "campaign_created",
					timestamp: "2024-01-01T00:00:00Z",
					details: "My Campaign",
				},
			];
			mockStmt.all.mockResolvedValue({ results });

			const activity = await dao.getRecentActivity("user1");

			expect(activity).toEqual(results);
		});

		it("propagates database errors when all rejects", async () => {
			expect.hasAssertions();

			mockStmt.all.mockRejectedValue(new Error("D1 query failed"));

			await expect(dao.getRecentActivity("user1")).rejects.toThrow(
				"D1 query failed"
			);
		});
	});

	describe("getLastActivity", () => {
		it("returns null when no activity", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const last = await dao.getLastActivity("user1");

			expect(last).toBeNull();
		});

		it("returns timestamp", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue({
				last_activity: "2024-01-01T12:00:00Z",
			});

			const last = await dao.getLastActivity("user1");

			expect(last).toBe("2024-01-01T12:00:00Z");
		});

		it("propagates database errors when first rejects", async () => {
			expect.hasAssertions();

			mockStmt.first.mockRejectedValue(new Error("D1 query failed"));

			await expect(dao.getLastActivity("user1")).rejects.toThrow(
				"D1 query failed"
			);
		});
	});

	describe("getUserActivity", () => {
		it("returns results", async () => {
			expect.hasAssertions();

			const results = [
				{
					type: "resource_uploaded",
					timestamp: "2024-01-01T00:00:00Z",
					details: "file.pdf",
				},
			];
			mockStmt.all.mockResolvedValue({ results });

			const activity = await dao.getUserActivity("user1");

			expect(activity).toEqual(results);
		});
	});

	describe("getCampaignResourcesOrdered", () => {
		it("returns results", async () => {
			expect.hasAssertions();

			const results = [{ id: 1, campaign_id: "c1" }];
			mockStmt.all.mockResolvedValue({ results });

			const resources = await dao.getCampaignResourcesOrdered("campaign-1");

			expect(resources).toEqual(results);
		});
	});

	describe("getCampaignContext", () => {
		it("throws when entityDAO missing", async () => {
			expect.hasAssertions();

			await expect(dao.getCampaignContext("campaign-1")).rejects.toThrow(
				"entityDAO is required"
			);
		});
	});

	describe("getCampaignCharacters", () => {
		it("throws when entityDAO missing", async () => {
			expect.hasAssertions();

			await expect(dao.getCampaignCharacters("campaign-1")).rejects.toThrow(
				"entityDAO is required"
			);
		});
	});
});
