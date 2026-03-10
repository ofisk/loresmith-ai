import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentDAO } from "@/dao/assessment-dao";

function createMockStmt() {
	return {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
	};
}

describe("AssessmentDAO", () => {
	let dao: AssessmentDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = {
			prepare: vi.fn().mockReturnValue(mockStmt),
		} as unknown as D1Database;
		dao = new AssessmentDAO(mockDB);
	});

	it("getCampaignCount returns 0 when no campaigns", async () => {
		mockStmt.first.mockResolvedValue(null);

		const count = await dao.getCampaignCount("user1");

		expect(count).toBe(0);
	});

	it("getCampaignCount returns count from result", async () => {
		mockStmt.first.mockResolvedValue({ count: 5 });

		const count = await dao.getCampaignCount("user1");

		expect(count).toBe(5);
	});

	it("getResourceCount returns 0 when no resources", async () => {
		mockStmt.first.mockResolvedValue(null);

		const count = await dao.getResourceCount("user1");

		expect(count).toBe(0);
	});

	it("getResourceCount returns count from result", async () => {
		mockStmt.first.mockResolvedValue({ count: 10 });

		const count = await dao.getResourceCount("user1");

		expect(count).toBe(10);
	});

	it("getRecentActivity returns empty array when no activity", async () => {
		mockStmt.all.mockResolvedValue({ results: [] });

		const activity = await dao.getRecentActivity("user1");

		expect(activity).toEqual([]);
	});

	it("getRecentActivity returns results", async () => {
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

	it("getLastActivity returns null when no activity", async () => {
		mockStmt.first.mockResolvedValue(null);

		const last = await dao.getLastActivity("user1");

		expect(last).toBeNull();
	});

	it("getLastActivity returns timestamp", async () => {
		mockStmt.first.mockResolvedValue({
			last_activity: "2024-01-01T12:00:00Z",
		});

		const last = await dao.getLastActivity("user1");

		expect(last).toBe("2024-01-01T12:00:00Z");
	});

	it("getUserActivity returns results", async () => {
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

	it("getCampaignResourcesOrdered returns results", async () => {
		const results = [{ id: 1, campaign_id: "c1" }];
		mockStmt.all.mockResolvedValue({ results });

		const resources = await dao.getCampaignResourcesOrdered("campaign-1");

		expect(resources).toEqual(results);
	});

	it("getCampaignContext throws when entityDAO missing", async () => {
		await expect(dao.getCampaignContext("campaign-1")).rejects.toThrow(
			"entityDAO is required"
		);
	});

	it("getCampaignCharacters throws when entityDAO missing", async () => {
		await expect(dao.getCampaignCharacters("campaign-1")).rejects.toThrow(
			"entityDAO is required"
		);
	});
});
