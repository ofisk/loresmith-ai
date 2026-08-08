import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Free-tier allowance behaviour of `LLMRateLimitService` (issue #746).
 *
 * The regression these guard against: a free account whose one-time welcome
 * grant is spent used to be permanently blocked. It must now fall back to the
 * recurring monthly allowance.
 */

const MONTHLY = 50_000;
const GRANT = 150_000;

const mockUserMonthlyUsageDAO = {
	getCurrentMonthUsage: vi.fn().mockResolvedValue(0),
	incrementUsage: vi.fn().mockResolvedValue(undefined),
};
const mockUserFreeTierUsageDAO = {
	getTrialUsage: vi.fn().mockResolvedValue(0),
	incrementUsage: vi.fn().mockResolvedValue(undefined),
};
const mockUserCreditsDAO = { getCredits: vi.fn().mockResolvedValue(0) };
const mockLlmUsageDAO = {
	insertUsage: vi.fn().mockResolvedValue(undefined),
	getUsageInLastHour: vi.fn().mockResolvedValue({ tph: 0, qph: 0 }),
	getUsageInLast24Hours: vi.fn().mockResolvedValue({ tpd: 0, qpd: 0 }),
};
const mockLlmCostEventDAO = {
	insertEvent: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({
		userMonthlyUsageDAO: mockUserMonthlyUsageDAO,
		userFreeTierUsageDAO: mockUserFreeTierUsageDAO,
		userCreditsDAO: mockUserCreditsDAO,
		llmUsageDAO: mockLlmUsageDAO,
		llmCostEventDAO: mockLlmCostEventDAO,
	})),
}));

const freeLimits = {
	maxCampaigns: 1,
	maxFiles: 5,
	storageBytes: 25 * 1024 * 1024,
	tph: 1_000_000,
	qph: 1_000,
	tpd: 5_000_000,
	qpd: 5_000,
	monthlyTokens: MONTHLY,
	trialTokens: GRANT,
	retriesPerFilePerDay: 2,
	retriesPerFilePerMonth: 6,
	resourcesPerCampaignPerHour: 5,
};

vi.mock("@/services/billing/subscription-service", () => ({
	getSubscriptionService: vi.fn(() => ({
		getTier: vi.fn().mockResolvedValue("free"),
		getTierLimits: vi.fn(() => freeLimits),
	})),
}));

vi.mock("@/lib/llm-usage-verbose-log", () => ({
	logVerboseLlmSpend: vi.fn(),
}));

const { LLMRateLimitService } = await import(
	"@/services/llm/llm-rate-limit-service"
);

const env = {} as never;

function service() {
	return new LLMRateLimitService(env);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(0);
	mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(0);
	mockUserCreditsDAO.getCredits.mockResolvedValue(0);
	mockLlmUsageDAO.getUsageInLastHour.mockResolvedValue({ tph: 0, qph: 0 });
	mockLlmUsageDAO.getUsageInLast24Hours.mockResolvedValue({ tpd: 0, qpd: 0 });
});

describe("checkLimit — free tier", () => {
	it("allows a user whose welcome grant is fully spent", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);

		const result = await service().checkLimit("gm", false);

		expect(result.allowed).toBe(true);
	});

	it("blocks only when the monthly allowance is spent too", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);

		const result = await service().checkLimit("gm", false);

		expect(result.allowed).toBe(false);
		expect(result.reason).toMatch(/refresh/i);
		expect(result.nextResetAt).toBeTruthy();
	});

	it("tells a blocked user when the allowance comes back", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);

		const result = await service().checkLimit("gm", false);

		const resetsAt = new Date(result.nextResetAt as string);
		expect(resetsAt.getDate()).toBe(1);
		expect(resetsAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("lets purchased credits unblock a fully drained account", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);
		mockUserCreditsDAO.getCredits.mockResolvedValue(25_000);

		const result = await service().checkLimit("gm", false);

		expect(result.allowed).toBe(true);
	});

	it("still bypasses everything for admins", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);

		const result = await service().checkLimit("root", true);

		expect(result.allowed).toBe(true);
	});
});

describe("recordUsage — bucket draw order", () => {
	it("charges the monthly allowance before the welcome grant", async () => {
		await service().recordUsage("gm", 10_000, 1, "claude-haiku-4-5");

		expect(mockUserMonthlyUsageDAO.incrementUsage).toHaveBeenCalledWith(
			"gm",
			10_000
		);
		expect(mockUserFreeTierUsageDAO.incrementUsage).not.toHaveBeenCalled();
	});

	it("overflows the remainder onto the welcome grant", async () => {
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(45_000);

		await service().recordUsage("gm", 10_000, 1, "claude-haiku-4-5");

		expect(mockUserMonthlyUsageDAO.incrementUsage).toHaveBeenCalledWith(
			"gm",
			5_000
		);
		expect(mockUserFreeTierUsageDAO.incrementUsage).toHaveBeenCalledWith(
			"gm",
			5_000
		);
	});

	it("charges the grant alone once the month is spent", async () => {
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);

		await service().recordUsage("gm", 8_000, 1, "claude-haiku-4-5");

		expect(mockUserMonthlyUsageDAO.incrementUsage).not.toHaveBeenCalled();
		expect(mockUserFreeTierUsageDAO.incrementUsage).toHaveBeenCalledWith(
			"gm",
			8_000
		);
	});
});

describe("checkIndexingQuota — free tier", () => {
	it("allows an index that fits in the remaining allowance", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);

		const result = await service().checkIndexingQuota("gm", false, 20_000);

		expect(result.allowed).toBe(true);
		expect(result.monthlyLimit).toBe(MONTHLY + GRANT);
	});

	it("blocks an index larger than what is left", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(45_000);

		const result = await service().checkIndexingQuota("gm", false, 20_000);

		expect(result.allowed).toBe(false);
		expect(result.wouldExceed).toBe(true);
		expect(result.nextResetAt).toBeTruthy();
	});

	it("reports usage that never exceeds the reported limit", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(GRANT + 12_000);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(MONTHLY);

		const result = await service().checkIndexingQuota("gm", false, 5_000);

		expect(result.monthlyUsage).toBeLessThanOrEqual(
			result.monthlyLimit as number
		);
	});
});

describe("getUsageStatus — free tier", () => {
	it("reports the combined allowance as the limit", async () => {
		mockUserFreeTierUsageDAO.getTrialUsage.mockResolvedValue(30_000);
		mockUserMonthlyUsageDAO.getCurrentMonthUsage.mockResolvedValue(20_000);

		const status = await service().getUsageStatus("gm", false);

		expect(status.monthlyLimit).toBe(MONTHLY + GRANT);
		expect(status.monthlyUsage).toBe(50_000);
	});
});
