import { describe, expect, it } from "vitest";
import {
	generateReadinessSummary,
	getCampaignState,
	getCampaignStateDescription,
	getNextMilestone,
} from "@/lib/campaign-state-utils";

describe("campaign-state-utils", () => {
	describe("getCampaignState", () => {
		it("returns Legendary for 90+", () => {
			expect(getCampaignState(90)).toBe("Legendary");
			expect(getCampaignState(100)).toBe("Legendary");
		});

		it("returns Epic-Ready for 80-89", () => {
			expect(getCampaignState(80)).toBe("Epic-Ready");
			expect(getCampaignState(89)).toBe("Epic-Ready");
		});

		it("returns Fresh Start for low scores", () => {
			expect(getCampaignState(0)).toBe("Fresh Start");
			expect(getCampaignState(19)).toBe("Fresh Start");
		});

		it("returns intermediate states", () => {
			expect(getCampaignState(50)).toBe("Growing Strong");
			expect(getCampaignState(60)).toBe("Flourishing");
			expect(getCampaignState(40)).toBe("Taking Shape");
		});
	});

	describe("generateReadinessSummary", () => {
		it("includes growth note for scores below 90", () => {
			const summary = generateReadinessSummary(50, "Growing Strong", []);
			expect(summary).toContain("Remember:");
			expect(summary).toContain("healthy growth");
		});

		it("omits score text when 90+", () => {
			const summary = generateReadinessSummary(95, "Legendary", []);
			expect(summary).not.toMatch(/\(\d+\/100\)/);
		});

		it("includes score text when below 90", () => {
			const summary = generateReadinessSummary(50, "Growing Strong", []);
			expect(summary).toContain("(50/100)");
		});
	});

	describe("getCampaignStateDescription", () => {
		it("returns description for known state", () => {
			const desc = getCampaignStateDescription("Legendary");
			expect(desc).toContain("legendary");
		});

		it("returns fallback for unknown state", () => {
			const desc = getCampaignStateDescription("Unknown");
			expect(desc).toBe("Your campaign continues to evolve and grow.");
		});
	});

	describe("getNextMilestone", () => {
		it("returns first milestone for score < 20", () => {
			const m = getNextMilestone(10);
			expect(m.threshold).toBe(20);
			expect(m.state).toBe("Newly Forged");
			expect(m.actionableSteps.length).toBeGreaterThan(0);
		});

		it("returns Perfect milestone for score >= 90", () => {
			const m = getNextMilestone(95);
			expect(m.threshold).toBe(100);
			expect(m.state).toBe("Perfect");
		});

		it("returns appropriate milestone for mid-range score", () => {
			const m = getNextMilestone(45);
			expect(m.threshold).toBe(50);
			expect(m.state).toBe("Growing Strong");
		});
	});
});
