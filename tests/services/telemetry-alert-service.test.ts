import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_COST_ALERT_THRESHOLDS,
	resolveCostAlertThresholds,
} from "@/config/cost-alert-thresholds";
import type { LLMCostEventDAO } from "@/dao/llm-cost-event-dao";
import { AlertService } from "@/services/telemetry/alert-service";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function createDao(overrides: {
	available?: boolean;
	perUser?: { username: string; costUsd: number; eventCount: number }[];
	totals?: Partial<{
		costUsd: number;
		eventCount: number;
		unpricedEvents: number;
		distinctUsers: number;
	}>;
}): LLMCostEventDAO {
	return {
		isAvailable: vi.fn().mockResolvedValue(overrides.available ?? true),
		getSpendByUserSince: vi.fn().mockResolvedValue(overrides.perUser ?? []),
		getTotals: vi.fn().mockResolvedValue({
			costUsd: 0,
			totalTokens: 0,
			promptTokens: 0,
			completionTokens: 0,
			cachedInputTokens: 0,
			cacheWriteTokens: 0,
			queryCount: 0,
			eventCount: 0,
			unpricedEvents: 0,
			distinctUsers: 0,
			cacheHitRate: 0,
			...overrides.totals,
		}),
	} as unknown as LLMCostEventDAO;
}

describe("resolveCostAlertThresholds", () => {
	it("falls back to defaults when unset", () => {
		expect(resolveCostAlertThresholds({})).toEqual(
			DEFAULT_COST_ALERT_THRESHOLDS
		);
	});

	it("reads string env overrides", () => {
		const thresholds = resolveCostAlertThresholds({
			LORESMITH_ALERT_USER_HOURLY_USD: "12.5",
		});
		expect(thresholds.userHourlySpendUsd).toBe(12.5);
	});

	it("ignores non-positive or unparseable overrides", () => {
		expect(
			resolveCostAlertThresholds({ LORESMITH_ALERT_ORG_HOURLY_USD: "nope" })
				.orgHourlySpendUsd
		).toBe(DEFAULT_COST_ALERT_THRESHOLDS.orgHourlySpendUsd);
		expect(
			resolveCostAlertThresholds({ LORESMITH_ALERT_ORG_HOURLY_USD: "-4" })
				.orgHourlySpendUsd
		).toBe(DEFAULT_COST_ALERT_THRESHOLDS.orgHourlySpendUsd);
	});
});

describe("AlertService", () => {
	const thresholds = {
		userHourlySpendUsd: 5,
		orgHourlySpendUsd: 50,
		unpricedShare: 0.2,
	};

	it("returns no alerts when spend is below every threshold", async () => {
		const service = new AlertService(
			createDao({
				perUser: [{ username: "a", costUsd: 1, eventCount: 3 }],
				totals: { costUsd: 1, eventCount: 3 },
			}),
			thresholds
		);

		const result = await service.getActiveAlerts(NOW);

		expect(result.alerts).toEqual([]);
		expect(result.thresholds.userHourlySpendUsd).toBe(5);
	});

	it("raises a per-user alert when one user crosses the hourly threshold", async () => {
		const service = new AlertService(
			createDao({
				perUser: [{ username: "spender", costUsd: 7, eventCount: 40 }],
				totals: { costUsd: 7, eventCount: 40, distinctUsers: 1 },
			}),
			thresholds
		);

		const { alerts } = await service.getActiveAlerts(NOW);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("user_hourly_spend");
		expect(alerts[0].username).toBe("spender");
		expect(alerts[0].severity).toBe("warning");
	});

	it("escalates to critical at twice the threshold", async () => {
		const service = new AlertService(
			createDao({
				perUser: [{ username: "runaway", costUsd: 10, eventCount: 900 }],
				totals: { costUsd: 10, eventCount: 900, distinctUsers: 1 },
			}),
			thresholds
		);

		const { alerts } = await service.getActiveAlerts(NOW);
		expect(alerts[0].severity).toBe("critical");
	});

	it("raises an org alert when no single user crossed the line", async () => {
		const service = new AlertService(
			createDao({
				perUser: [
					{ username: "a", costUsd: 4, eventCount: 10 },
					{ username: "b", costUsd: 4, eventCount: 10 },
				],
				totals: { costUsd: 60, eventCount: 500, distinctUsers: 20 },
			}),
			thresholds
		);

		const { alerts } = await service.getActiveAlerts(NOW);

		expect(alerts.map((a) => a.type)).toEqual(["org_hourly_spend"]);
	});

	it("warns when too much spend could not be priced", async () => {
		const service = new AlertService(
			createDao({
				totals: { costUsd: 1, eventCount: 10, unpricedEvents: 5 },
			}),
			thresholds
		);

		const { alerts } = await service.getActiveAlerts(NOW);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("unpriced_spend");
		expect(alerts[0].severity).toBe("info");
		expect(alerts[0].value).toBeCloseTo(0.5, 6);
	});

	it("sorts critical before warning before info", async () => {
		const service = new AlertService(
			createDao({
				perUser: [
					{ username: "runaway", costUsd: 20, eventCount: 900 },
					{ username: "busy", costUsd: 6, eventCount: 30 },
				],
				totals: { costUsd: 26, eventCount: 10, unpricedEvents: 9 },
			}),
			thresholds
		);

		const { alerts } = await service.getActiveAlerts(NOW);

		expect(alerts.map((a) => a.severity)).toEqual([
			"critical",
			"warning",
			"info",
		]);
	});

	it("returns an empty result before the migration has been applied", async () => {
		const service = new AlertService(
			createDao({ available: false }),
			thresholds
		);

		const result = await service.getActiveAlerts(NOW);

		expect(result.alerts).toEqual([]);
		expect(result.thresholds.orgHourlySpendUsd).toBe(50);
	});
});
