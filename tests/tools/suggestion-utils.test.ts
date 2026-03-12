import { describe, expect, it } from "vitest";
import { READINESS_ENTITY_BUCKETS } from "@/lib/entity/entity-types";
import {
	buildReadinessRecommendations,
	CHECKLIST_ITEMS,
	computeEntityTypeCounts,
	generateSuggestions,
	getCampaignState,
	isThemePreferenceEntity,
	sumBucket,
} from "@/tools/campaign-context/suggestion-utils";

describe("suggestion-utils", () => {
	describe("CHECKLIST_ITEMS", () => {
		it("has expected keys", () => {
			const keys = CHECKLIST_ITEMS.map((item) => item.key);
			expect(keys).toContain("campaign_tone");
			expect(keys).toContain("starting_location");
			expect(keys).toContain("factions");
		});
	});

	describe("generateSuggestions", () => {
		it("returns session suggestions for session type", () => {
			const suggestions = generateSuggestions("session", [], [], undefined);
			expect(suggestions.length).toBe(2);
			expect(suggestions[0].title).toBe("Plan a Combat Encounter");
		});

		it("returns character suggestion for character type", () => {
			const suggestions = generateSuggestions("character", [], [], undefined);
			expect(suggestions.length).toBe(1);
			expect(suggestions[0].title).toBe("Character Development Arc");
		});

		it("returns plot suggestion for plot type", () => {
			const suggestions = generateSuggestions("plot", [], [], undefined);
			expect(suggestions[0].title).toBe("Main Story Advancement");
		});

		it("returns default for unknown type", () => {
			const suggestions = generateSuggestions("unknown", [], [], undefined);
			expect(suggestions[0].title).toBe("General Session Planning");
		});
	});

	describe("getCampaignState", () => {
		it("returns Legendary for 90+", () => {
			expect(getCampaignState(90)).toBe("Legendary");
			expect(getCampaignState(95)).toBe("Legendary");
		});

		it("returns Epic-Ready for 80-89", () => {
			expect(getCampaignState(80)).toBe("Epic-Ready");
		});

		it("returns Fresh Start for low scores", () => {
			expect(getCampaignState(10)).toBe("Fresh Start");
			expect(getCampaignState(0)).toBe("Fresh Start");
		});

		it("returns intermediate states", () => {
			expect(getCampaignState(50)).toBe("Growing Strong");
			expect(getCampaignState(60)).toBe("Flourishing");
		});
	});

	describe("sumBucket", () => {
		it("sums counts for bucket types", () => {
			const counts = { npcs: 2, locations: 3, factions: 1 };
			const sum = sumBucket(["npcs", "locations"] as any, counts);
			expect(sum).toBe(5);
		});

		it("returns 0 for missing types", () => {
			const counts = {};
			expect(sumBucket(READINESS_ENTITY_BUCKETS.npcLike, counts)).toBe(0);
		});
	});

	describe("buildReadinessRecommendations", () => {
		it("adds campaign_tone when not covered", () => {
			const recs = buildReadinessRecommendations({
				coverage: { campaign_tone: false },
				entityStats: undefined,
				characters: [],
				resources: [],
				score: 50,
			});
			expect(recs.some((r) => r.includes("campaign tone"))).toBe(true);
		});

		it("skips campaign_tone when covered", () => {
			const recs = buildReadinessRecommendations({
				coverage: { campaign_tone: true },
				entityStats: undefined,
				characters: [],
				resources: [],
				score: 50,
			});
			expect(recs.some((r) => r.includes("campaign tone"))).toBe(false);
		});

		it("fallback recommendations when no coverage", () => {
			const recs = buildReadinessRecommendations({
				coverage: undefined,
				entityStats: undefined,
				characters: [],
				resources: [],
				score: 30,
			});
			expect(recs).toContain("Add more campaign context and resources");
			expect(recs).toContain("Create more character profiles");
		});
	});

	describe("computeEntityTypeCounts", () => {
		it("counts valid entity types", () => {
			const entities = [
				{ entityType: "npcs" },
				{ entityType: "npcs" },
				{ entityType: "locations" },
			];
			const counts = computeEntityTypeCounts(entities);
			expect(counts.npcs).toBe(2);
			expect(counts.locations).toBe(1);
		});

		it("skips invalid types", () => {
			const entities = [{ entityType: "unknown_type" }];
			const counts = computeEntityTypeCounts(entities);
			expect(Object.keys(counts)).not.toContain("unknown_type");
		});
	});

	describe("isThemePreferenceEntity", () => {
		it("returns true for theme_preference conversational_context", () => {
			expect(
				isThemePreferenceEntity({
					entityType: "conversational_context",
					metadata: { noteType: "theme_preference" },
				})
			).toBe(true);
		});

		it("returns false for other note types", () => {
			expect(
				isThemePreferenceEntity({
					entityType: "conversational_context",
					metadata: { noteType: "other" },
				})
			).toBe(false);
		});

		it("returns false for other entity types", () => {
			expect(
				isThemePreferenceEntity({
					entityType: "npcs",
					metadata: { noteType: "theme_preference" },
				})
			).toBe(false);
		});
	});
});
