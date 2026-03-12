import { describe, expect, it } from "vitest";
import { ENTITY_TYPE_PCS } from "@/lib/entity/entity-type-constants";
import {
	analyzeGaps,
	analyzePlayerCharacterCompleteness,
	generateHooks,
	getGapSeverityByImportance,
	getPlayerCharacterEntities,
} from "@/tools/campaign/planning-tools-utils";

describe("planning-tools-utils", () => {
	describe("analyzeGaps", () => {
		it("returns empty array when no mentioned names or all exist in entities", () => {
			const script = "The party meets [[Gandalf]] at the inn.";
			const entities = [
				{ entityId: "1", entityName: "Gandalf", entityType: "npc" },
			];
			const result = analyzeGaps(script, entities);
			expect(result).toHaveLength(0);
		});

		it("returns gaps when script mentions names not in entities", () => {
			const script =
				"NPC: Gandalf speaks to the party. The location is Rivendell.";
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities);
			expect(result.length).toBeGreaterThan(0);
			expect(
				result.some((g) => g.type === "npcs" || g.type === "locations")
			).toBe(true);
		});

		it("uses custom when no npc/location/item keywords", () => {
			const script = "Something about [[MysteryThing]].";
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities);
			expect(result.length).toBeGreaterThan(0);
			expect(result.some((g) => g.type === "custom")).toBe(true);
		});

		it("uses items type when script mentions item-like keywords", () => {
			const script = "The party finds the treasure [[Sword of Light]].";
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities);
			expect(result.length).toBeGreaterThan(0);
			expect(result.some((g) => g.type === "items")).toBe(true);
		});

		it("uses custom classifyGap when provided", () => {
			const script = "[[CustomEntity]] appears.";
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities, {
				classifyGap: () => "locations",
			});
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("locations");
			expect(result[0].description).toContain("Location");
		});

		it("ignores short names (length <= 2)", () => {
			const script = "[[Ab]] is here.";
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities);
			expect(result).toHaveLength(0);
		});

		it("extracts quoted names", () => {
			const script = 'The villain "Dark Lord" appears.';
			const entities: Array<{
				entityId: string;
				entityName: string;
				entityType: string;
			}> = [];
			const result = analyzeGaps(script, entities);
			expect(result.length).toBeGreaterThan(0);
			expect(result.some((g) => g.description.includes("Dark Lord"))).toBe(
				true
			);
		});
	});

	describe("generateHooks", () => {
		it("returns opening hooks for type opening", async () => {
			const hooks = await generateHooks("opening");
			expect(hooks.length).toBe(2);
			expect(hooks[0]).toHaveProperty("title");
			expect(hooks[0]).toHaveProperty("description");
			expect(hooks[0]).toHaveProperty("setup");
			expect(hooks[0]).toHaveProperty("payoff");
			expect(hooks[0].title).toBe("Mysterious Message");
		});

		it("returns one hook for type transition", async () => {
			const hooks = await generateHooks("transition");
			expect(hooks.length).toBe(1);
			expect(hooks[0].title).toBe("Fork in the Road");
		});

		it("returns one hook for type cliffhanger", async () => {
			const hooks = await generateHooks("cliffhanger");
			expect(hooks.length).toBe(1);
			expect(hooks[0].title).toBe("Sudden Interruption");
		});

		it("returns one hook for type resolution", async () => {
			const hooks = await generateHooks("resolution");
			expect(hooks.length).toBe(1);
			expect(hooks[0].title).toBe("Revelation");
		});

		it("returns empty array for unknown type", async () => {
			const hooks = await generateHooks("unknown");
			expect(hooks).toEqual([]);
		});

		it("uses custom generator when provided", async () => {
			const customHooks = [
				{ title: "Custom", description: "d", setup: "s", payoff: "p" },
			];
			const hooks = await generateHooks("opening", "", [], [], {
				generator: async () => customHooks,
			});
			expect(hooks).toEqual(customHooks);
		});
	});

	describe("getGapSeverityByImportance", () => {
		it("returns critical for player character type", () => {
			expect(getGapSeverityByImportance(ENTITY_TYPE_PCS, 50)).toBe("critical");
			expect(getGapSeverityByImportance(ENTITY_TYPE_PCS, 100)).toBe("critical");
		});

		it("returns important for high importance score (80+)", () => {
			expect(getGapSeverityByImportance("npc", 90)).toBe("important");
			expect(getGapSeverityByImportance("npc", 80)).toBe("important");
		});

		it("returns minor for medium importance (60-79)", () => {
			expect(getGapSeverityByImportance("npc", 70)).toBe("minor");
			expect(getGapSeverityByImportance("npc", 60)).toBe("minor");
		});

		it("returns minor for low importance (<60)", () => {
			expect(getGapSeverityByImportance("npc", 50)).toBe("minor");
			expect(getGapSeverityByImportance("location", 0)).toBe("minor");
		});
	});

	describe("getPlayerCharacterEntities", () => {
		it("returns entities from dao", async () => {
			const mockEntities = [
				{
					id: "1",
					campaignId: "c1",
					entityType: ENTITY_TYPE_PCS,
					name: "Hero",
					content: {},
					createdAt: "",
					updatedAt: "",
				},
			];
			const mockDAO = {
				listEntitiesByCampaign: async () => mockEntities,
			};
			const result = await getPlayerCharacterEntities(
				mockDAO as any,
				"campaign-1"
			);
			expect(result).toEqual(mockEntities);
		});
	});

	describe("analyzePlayerCharacterCompleteness", () => {
		it("reports gaps when character lacks backstory and motivations", async () => {
			const mockGraph = { getNeighbors: async () => [] };
			const result = await analyzePlayerCharacterCompleteness(
				{
					id: "pc-1",
					name: "Incomplete",
					entityType: ENTITY_TYPE_PCS,
					content: {},
				},
				"campaign-1",
				mockGraph as any
			);
			expect(result.length).toBeGreaterThan(0);
			expect(result.some((g) => g.type.includes("backstory"))).toBe(true);
			expect(result.some((g) => g.type.includes("motivations"))).toBe(true);
		});

		it("reports no backstory gap when character has backstory", async () => {
			const mockGraph = {
				getNeighbors: async () => [{ relationshipType: "knows" }],
			};
			const result = await analyzePlayerCharacterCompleteness(
				{
					id: "pc-2",
					name: "Complete",
					entityType: ENTITY_TYPE_PCS,
					content: {
						backstory: "A long backstory",
						motivation: "Justice",
						goals: ["Save the world"],
						personalityTraits: "Brave",
					},
				},
				"campaign-1",
				mockGraph as any
			);
			expect(result.some((g) => g.type.includes("backstory"))).toBe(false);
			expect(result.some((g) => g.type.includes("motivations"))).toBe(false);
		});

		it("uses importanceService when provided", async () => {
			const mockGraph = { getNeighbors: async () => [] };
			const mockImportance = {
				getEntityImportance: async () => 85,
			};
			const result = await analyzePlayerCharacterCompleteness(
				{
					id: "pc-3",
					name: "Test",
					entityType: "npc",
					content: {},
				},
				"campaign-1",
				mockGraph as any,
				mockImportance as any
			);
			expect(result.some((g) => g.severity === "important")).toBe(true);
		});
	});
});
