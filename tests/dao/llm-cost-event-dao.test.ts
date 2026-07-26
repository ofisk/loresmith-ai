import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLMCostEventDAO } from "@/dao/llm-cost-event-dao";

function createMockStmt() {
	return {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
		all: vi.fn().mockResolvedValue({ results: [] }),
		first: vi.fn().mockResolvedValue(null),
	};
}

const WINDOW = { fromDate: "2026-07-01", toDate: "2026-07-08" };

describe("LLMCostEventDAO", () => {
	let dao: LLMCostEventDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = {
			prepare: vi.fn().mockReturnValue(mockStmt),
		} as unknown as D1Database;
		dao = new LLMCostEventDAO(mockDB);
	});

	it("insertEvent binds every attribution column in order", async () => {
		await dao.insertEvent({
			username: "user1",
			tier: "pro",
			intent: "user_prompt",
			source: "base_agent:onChatMessage",
			agent: "CampaignAgent",
			model: "claude-sonnet-5",
			provider: "anthropic",
			modelRole: "INTERACTIVE",
			surface: "interactive",
			promptTokens: 100,
			completionTokens: 20,
			cachedInputTokens: 5,
			cacheWriteTokens: 2,
			totalTokens: 127,
			queryCount: 1,
			costUsd: 0.0006,
			priced: true,
		});

		expect(mockStmt.bind).toHaveBeenCalledWith(
			"user1",
			"pro",
			"user_prompt",
			"base_agent:onChatMessage",
			"CampaignAgent",
			"claude-sonnet-5",
			"anthropic",
			"INTERACTIVE",
			"interactive",
			100,
			20,
			5,
			2,
			127,
			1,
			0.0006,
			1
		);
		expect(mockStmt.run).toHaveBeenCalled();
	});

	it("stores priced=0 for events it could not price", async () => {
		await dao.insertEvent({
			username: "user1",
			tier: "free",
			intent: "entity_extraction",
			surface: "pipeline",
			promptTokens: 0,
			completionTokens: 0,
			cachedInputTokens: 0,
			cacheWriteTokens: 0,
			totalTokens: 500,
			queryCount: 1,
			costUsd: 0,
			priced: false,
		});

		const args = mockStmt.bind.mock.calls[0];
		expect(args[args.length - 1]).toBe(0);
	});

	describe("getTotals", () => {
		it("computes cache hit rate over all input tokens", async () => {
			mockStmt.all.mockResolvedValue({
				results: [
					{
						cost_usd: 1.5,
						total_tokens: 1000,
						prompt_tokens: 250,
						completion_tokens: 100,
						cached_input_tokens: 750,
						cache_write_tokens: 0,
						query_count: 10,
						event_count: 10,
						unpriced_events: 1,
						distinct_users: 3,
					},
				],
			});

			const totals = await dao.getTotals(WINDOW);

			expect(totals.costUsd).toBe(1.5);
			// 750 cached / (750 cached + 250 uncached)
			expect(totals.cacheHitRate).toBeCloseTo(0.75, 6);
			expect(totals.distinctUsers).toBe(3);
			expect(totals.unpricedEvents).toBe(1);
		});

		it("reports a zero hit rate rather than NaN when there is no input", async () => {
			mockStmt.all.mockResolvedValue({ results: [] });
			const totals = await dao.getTotals(WINDOW);
			expect(totals.cacheHitRate).toBe(0);
			expect(totals.costUsd).toBe(0);
		});
	});

	describe("getBreakdown", () => {
		it("computes share against the caller's window total", async () => {
			mockStmt.all.mockResolvedValue({
				results: [
					{
						key: "CampaignAgent",
						cost_usd: 3,
						total_tokens: 100,
						prompt_tokens: 80,
						completion_tokens: 20,
						cached_input_tokens: 0,
						cache_write_tokens: 0,
						query_count: 4,
						event_count: 4,
						unpriced_events: 0,
					},
				],
			});

			const [row] = await dao.getBreakdown("agent", WINDOW, 12);

			expect(row.key).toBe("CampaignAgent");
			expect(row.costShare).toBeCloseTo(0.25, 6);
		});

		it("labels NULL dimension values as unattributed", async () => {
			mockStmt.all.mockResolvedValue({
				results: [{ key: null, cost_usd: 1, event_count: 1 }],
			});
			const [row] = await dao.getBreakdown("modelRole", WINDOW, 1);
			expect(row.key).toBe("unattributed");
		});

		it("returns a zero share when the window total is zero", async () => {
			mockStmt.all.mockResolvedValue({
				results: [{ key: "x", cost_usd: 0, event_count: 2 }],
			});
			const [row] = await dao.getBreakdown("intent", WINDOW, 0);
			expect(row.costShare).toBe(0);
			expect(Number.isNaN(row.costShare)).toBe(false);
		});

		it("rejects a dimension that is not on the whitelist", async () => {
			await expect(
				// Simulates an unvalidated query-string value reaching the DAO.
				dao.getBreakdown("username; DROP TABLE" as never, WINDOW, 1)
			).rejects.toThrow(/Unsupported cost dimension/);
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});
	});

	describe("getCostPerTier", () => {
		it("divides tier spend by the number of distinct users", async () => {
			mockStmt.all.mockResolvedValue({
				results: [
					{
						tier: "basic",
						cost_usd: 10,
						user_count: 4,
						total_tokens: 900,
						event_count: 40,
					},
				],
			});

			const [row] = await dao.getCostPerTier(WINDOW);

			expect(row.tier).toBe("basic");
			expect(row.costPerUserUsd).toBeCloseTo(2.5, 6);
		});

		it("avoids dividing by zero when a tier has no users", async () => {
			mockStmt.all.mockResolvedValue({
				results: [{ tier: "pro", cost_usd: 5, user_count: 0 }],
			});
			const [row] = await dao.getCostPerTier(WINDOW);
			expect(row.costPerUserUsd).toBe(0);
		});
	});

	it("pruneOldRows deletes beyond the retention horizon", async () => {
		mockStmt.run.mockResolvedValue({ meta: { changes: 12 } });
		const deleted = await dao.pruneOldRows(90);
		expect(deleted).toBe(12);
		expect(mockStmt.bind).toHaveBeenCalledWith("-90 days");
	});

	it("isAvailable is false before the migration has run", async () => {
		mockStmt.all.mockResolvedValue({ results: [] });
		expect(await dao.isAvailable()).toBe(false);
	});

	it("isAvailable is true once the table exists", async () => {
		mockStmt.all.mockResolvedValue({ results: [{ name: "llm_cost_events" }] });
		expect(await dao.isAvailable()).toBe(true);
	});
});
