import { describe, expect, it, vi } from "vitest";
import type { LLMCostEventDAO } from "@/dao/llm-cost-event-dao";
import { CostAttributionService } from "@/services/telemetry/cost-attribution-service";

const QUERY = { fromDate: "2026-07-19", toDate: "2026-07-26" };

function createDao(available = true) {
	const totals = {
		costUsd: 40,
		totalTokens: 1000,
		promptTokens: 800,
		completionTokens: 200,
		cachedInputTokens: 0,
		cacheWriteTokens: 0,
		queryCount: 25,
		eventCount: 25,
		unpricedEvents: 0,
		distinctUsers: 4,
		cacheHitRate: 0,
	};
	return {
		isAvailable: vi.fn().mockResolvedValue(available),
		getTotals: vi.fn().mockResolvedValue(totals),
		getBreakdown: vi.fn().mockResolvedValue([]),
		getCostPerTier: vi.fn().mockResolvedValue([]),
		getTopSpenders: vi.fn().mockResolvedValue([]),
	} as unknown as LLMCostEventDAO & {
		getBreakdown: ReturnType<typeof vi.fn>;
		getTotals: ReturnType<typeof vi.fn>;
	};
}

describe("CostAttributionService", () => {
	it("returns an empty snapshot when the table does not exist yet", async () => {
		const dao = createDao(false);
		const service = new CostAttributionService(dao);

		const result = await service.getAttribution(QUERY);

		expect(result.totals.costUsd).toBe(0);
		expect(result.byAgent).toEqual([]);
		expect(dao.getTotals).not.toHaveBeenCalled();
	});

	it("passes the window total to every breakdown so shares share a denominator", async () => {
		const dao = createDao();
		const service = new CostAttributionService(dao);

		await service.getAttribution(QUERY);

		expect(dao.getBreakdown).toHaveBeenCalledTimes(6);
		for (const call of dao.getBreakdown.mock.calls) {
			expect(call[2]).toBe(40);
		}
	});

	it("requests every dimension the dashboard renders", async () => {
		const dao = createDao();
		const service = new CostAttributionService(dao);

		await service.getAttribution(QUERY);

		expect(dao.getBreakdown.mock.calls.map((c) => c[0])).toEqual([
			"agent",
			"intent",
			"model",
			"modelRole",
			"surface",
			"tier",
		]);
	});

	it("echoes the requested window back to the client", async () => {
		const service = new CostAttributionService(createDao());
		const result = await service.getAttribution(QUERY);
		expect(result.window).toEqual({
			from: QUERY.fromDate,
			to: QUERY.toDate,
		});
	});
});
