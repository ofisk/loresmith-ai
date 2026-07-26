import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/dao/entity-dao";
import { RunsheetAssemblyService } from "@/services/campaign/runsheet-assembly-service";
import type {
	SessionDigestData,
	SessionDigestWithData,
} from "@/types/session-digest";

const listEntitiesByCampaign = vi.fn();
const getSessionDigestsByCampaign = vi.fn();
const listPlanningTasks = vi.fn();
const getActiveRulesForCampaign = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: () => ({
		entityDAO: { listEntitiesByCampaign },
		sessionDigestDAO: { getSessionDigestsByCampaign },
		planningTaskDAO: { listByCampaign: listPlanningTasks },
	}),
}));

vi.mock("@/services/campaign/rules-context-service", () => ({
	RulesContextService: {
		getActiveRulesForCampaign: (...args: unknown[]) =>
			getActiveRulesForCampaign(...args),
	},
}));

function digestData(
	overrides: Partial<SessionDigestData> = {}
): SessionDigestData {
	return {
		last_session_recap: {
			key_events: [],
			state_changes: { factions: [], locations: [], npcs: [] },
			open_threads: [],
		},
		next_session_plan: {
			objectives_dm: [],
			probable_player_goals: [],
			beats: [],
			if_then_branches: [],
		},
		npcs_to_run: [],
		locations_in_focus: [],
		encounter_seeds: [],
		clues_and_revelations: [],
		treasure_and_rewards: [],
		todo_checklist: [],
		...overrides,
	};
}

function digest(
	sessionNumber: number,
	data: SessionDigestData,
	overrides: Partial<SessionDigestWithData> = {}
): SessionDigestWithData {
	return {
		id: `digest-${sessionNumber}`,
		campaignId: "campaign-1",
		sessionNumber,
		sessionDate: null,
		digestData: data,
		status: "approved",
		qualityScore: null,
		reviewNotes: null,
		generatedByAi: false,
		templateId: null,
		sourceType: "manual",
		createdAt: "2026-07-01",
		updatedAt: "2026-07-01",
		...overrides,
	};
}

function entity(
	id: string,
	entityType: string,
	name: string,
	content: Record<string, unknown>
): Entity {
	return {
		id,
		campaignId: "campaign-1",
		entityType,
		name,
		content,
		createdAt: "2026-07-01",
		updatedAt: "2026-07-01",
	};
}

/** Route each entity-type query to the right fixture list. */
function stubEntities(byType: Record<string, Entity[]>) {
	listEntitiesByCampaign.mockImplementation(
		(_campaignId: string, options: { entityType?: string }) =>
			Promise.resolve(byType[options.entityType ?? ""] ?? [])
	);
}

describe("RunsheetAssemblyService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSessionDigestsByCampaign.mockResolvedValue([]);
		listPlanningTasks.mockResolvedValue([]);
		getActiveRulesForCampaign.mockResolvedValue([]);
		stubEntities({});
	});

	describe("selectSourceDigest", () => {
		// A digest for session N holds the recap OF N and the plan FOR N+1, so the
		// runsheet for session N+1 is fed by the digest immediately below it.
		it("picks the highest-numbered digest below the target session", () => {
			expect.hasAssertions();

			const digests = [
				digest(1, digestData()),
				digest(3, digestData()),
				digest(2, digestData()),
			];

			const selected = RunsheetAssemblyService.selectSourceDigest(digests, 4);

			expect(selected?.sessionNumber).toBe(3);
		});

		it("ignores digests at or above the target session", () => {
			expect.hasAssertions();

			const digests = [digest(4, digestData()), digest(5, digestData())];

			expect(RunsheetAssemblyService.selectSourceDigest(digests, 4)).toBeNull();
		});

		it("skips rejected digests so a rejected plan cannot resurface", () => {
			expect.hasAssertions();

			const digests = [
				digest(2, digestData()),
				digest(3, digestData(), { status: "rejected" }),
			];

			const selected = RunsheetAssemblyService.selectSourceDigest(digests, 4);

			expect(selected?.sessionNumber).toBe(2);
		});

		it("returns null when the campaign has no digests at all", () => {
			expect.hasAssertions();

			expect(RunsheetAssemblyService.selectSourceDigest([], 1)).toBeNull();
		});
	});

	describe("buildCast", () => {
		it("builds a one-line hook from goals and quirks", () => {
			expect.hasAssertions();

			const npc = entity("npc-1", "npcs", "Vex Ashford", {
				role: "Harbormaster",
				goals: "Buy back her brother's debt",
				quirks: "Speaks only in questions",
				secrets: "She already sold the ledger",
				summary: "A tired official.",
			});

			const cast = RunsheetAssemblyService.buildCast(
				digest(2, digestData({ npcs_to_run: ["Vex Ashford"] })),
				[npc]
			);

			expect(cast).toHaveLength(1);
			expect(cast[0].hook).toBe(
				"Buy back her brother's debt — Speaks only in questions"
			);
			expect(cast[0].role).toBe("Harbormaster");
			expect(cast[0].secrets).toBe("She already sold the ledger");
			expect(cast[0].source.kind).toBe("entity");
		});

		it("falls back to the summary when there is no goal or quirk", () => {
			expect.hasAssertions();

			const npc = entity("npc-1", "npcs", "Bell", {
				summary: "A nervous courier.",
			});

			const cast = RunsheetAssemblyService.buildCast(
				digest(2, digestData({ npcs_to_run: ["Bell"] })),
				[npc]
			);

			expect(cast[0].hook).toBe("A nervous courier.");
		});

		// The digest lists names the GM typed; an unmatched name is still someone
		// they need on the page.
		it("keeps NPCs with no matching entity, attributed to the digest", () => {
			expect.hasAssertions();

			const cast = RunsheetAssemblyService.buildCast(
				digest(2, digestData({ npcs_to_run: ["Someone Unrecorded"] })),
				[]
			);

			expect(cast).toHaveLength(1);
			expect(cast[0].name).toBe("Someone Unrecorded");
			expect(cast[0].hook).toBe("");
			expect(cast[0].source.kind).toBe("session_digest");
		});

		it("matches entity names case-insensitively", () => {
			expect.hasAssertions();

			const npc = entity("npc-1", "npcs", "Vex Ashford", {
				summary: "Harbormaster.",
			});

			const cast = RunsheetAssemblyService.buildCast(
				digest(2, digestData({ npcs_to_run: ["  vex   ashford "] })),
				[npc]
			);

			expect(cast[0].name).toBe("Vex Ashford");
			expect(cast[0].source.kind).toBe("entity");
		});

		it("returns nothing when the digest lists no NPCs", () => {
			expect.hasAssertions();

			expect(
				RunsheetAssemblyService.buildCast(digest(2, digestData()), [])
			).toEqual([]);
		});
	});

	describe("buildEncounters", () => {
		it("attaches a statblock summary when a monster name appears in the seed", () => {
			expect.hasAssertions();

			const monster = entity("mon-1", "monsters", "Bone Naga", {
				summary: "A serpentine undead spellcaster.",
				cr: "4",
				ac: "15",
				hp: "58",
			});

			const encounters = RunsheetAssemblyService.buildEncounters(
				digest(
					2,
					digestData({
						encounter_seeds: ["A Bone Naga guards the flooded stair"],
					})
				),
				[monster]
			);

			expect(encounters).toHaveLength(1);
			expect(encounters[0].name).toBe("A Bone Naga guards the flooded stair");
			expect(encounters[0].summary).toBe("A serpentine undead spellcaster.");
			expect(encounters[0].statblock).toEqual({
				CR: "4",
				AC: "15",
				HP: "58",
			});
		});

		it("keeps an unmatched seed with an empty statblock", () => {
			expect.hasAssertions();

			const encounters = RunsheetAssemblyService.buildEncounters(
				digest(2, digestData({ encounter_seeds: ["Something in the fog"] })),
				[]
			);

			expect(encounters[0].statblock).toEqual({});
			expect(encounters[0].source.kind).toBe("session_digest");
		});

		// "Rat" or "Imp" would match half the prose in a campaign.
		it("does not guess from very short monster names", () => {
			expect.hasAssertions();

			const monster = entity("mon-1", "monsters", "Rat", { cr: "0" });

			const encounters = RunsheetAssemblyService.buildEncounters(
				digest(
					2,
					digestData({ encounter_seeds: ["The party negotiates a truce"] })
				),
				[monster]
			);

			expect(encounters[0].statblock).toEqual({});
		});

		it("prefers the longest matching monster name", () => {
			expect.hasAssertions();

			const shortName = entity("mon-1", "monsters", "Naga", { cr: "8" });
			const longName = entity("mon-2", "monsters", "Bone Naga", { cr: "4" });

			const encounters = RunsheetAssemblyService.buildEncounters(
				digest(2, digestData({ encounter_seeds: ["The Bone Naga awakens"] })),
				[shortName, longName]
			);

			expect(encounters[0].statblock.CR).toBe("4");
		});
	});

	describe("buildLoot", () => {
		it("enriches a reward with the matching item's rarity and text", () => {
			expect.hasAssertions();

			const item = entity("item-1", "items", "Sunblade", {
				rarity: "rare",
				text: "A hilt that projects a blade of light.",
			});

			const loot = RunsheetAssemblyService.buildLoot(
				digest(2, digestData({ treasure_and_rewards: ["Sunblade"] })),
				[item]
			);

			expect(loot[0].detail).toBe(
				"(rare) A hilt that projects a blade of light."
			);
			expect(loot[0].source.kind).toBe("entity");
		});

		it("keeps rewards that match no item entity", () => {
			expect.hasAssertions();

			const loot = RunsheetAssemblyService.buildLoot(
				digest(2, digestData({ treasure_and_rewards: ["300 gp in old coin"] })),
				[]
			);

			expect(loot).toHaveLength(1);
			expect(loot[0].detail).toBe("");
		});
	});

	describe("buildRules", () => {
		// Core-book rules are what the GM already owns a book for.
		it("keeps only active house rules", () => {
			expect.hasAssertions();

			const rules = RunsheetAssemblyService.buildRules([
				{
					id: "r1",
					name: "Flanking",
					category: "combat",
					text: "Flanking grants advantage.",
					source: "house",
					active: true,
				},
				{
					id: "r2",
					name: "Retired rule",
					category: "combat",
					text: "No longer used.",
					source: "house",
					active: false,
				},
				{
					id: "r3",
					name: "Grappling",
					category: "combat",
					text: "From the core book.",
					source: "source",
					active: true,
				},
			]);

			expect(rules).toHaveLength(1);
			expect(rules[0].name).toBe("Flanking");
			expect(rules[0].source.kind).toBe("house_rule");
		});
	});

	describe("buildOpenThreads", () => {
		it("combines digest threads with hook entities", () => {
			expect.hasAssertions();

			const hook = entity("hook-1", "hooks", "The sealed vault", {
				text: "Nobody has opened the vault beneath the guildhall.",
			});

			const threads = RunsheetAssemblyService.buildOpenThreads(
				digest(
					2,
					digestData({
						last_session_recap: {
							key_events: [],
							state_changes: { factions: [], locations: [], npcs: [] },
							open_threads: ["Who paid the assassin?"],
						},
					})
				),
				[hook]
			);

			expect(threads).toHaveLength(2);
			expect(threads[0].source.kind).toBe("session_digest");
			expect(threads[1].source.kind).toBe("entity");
		});

		it("does not repeat a hook already listed in the digest", () => {
			expect.hasAssertions();

			const hook = entity("hook-1", "hooks", "Assassin", {
				text: "Who paid the assassin?",
			});

			const threads = RunsheetAssemblyService.buildOpenThreads(
				digest(
					2,
					digestData({
						last_session_recap: {
							key_events: [],
							state_changes: { factions: [], locations: [], npcs: [] },
							open_threads: ["Who paid the assassin?"],
						},
					})
				),
				[hook]
			);

			expect(threads).toHaveLength(1);
		});
	});

	describe("assemble", () => {
		it("assembles a full runsheet from existing campaign data", async () => {
			expect.hasAssertions();

			getSessionDigestsByCampaign.mockResolvedValue([
				digest(
					2,
					digestData({
						last_session_recap: {
							key_events: ["The bridge fell"],
							state_changes: {
								factions: ["Guild weakened"],
								locations: [],
								npcs: [],
							},
							open_threads: ["Who paid the assassin?"],
						},
						next_session_plan: {
							objectives_dm: ["Reveal the ledger"],
							probable_player_goals: ["Find the harbormaster"],
							beats: ["Open in the ruined chapel"],
							if_then_branches: ["If they split up, cut between them"],
						},
						npcs_to_run: ["Vex Ashford"],
						encounter_seeds: ["A Bone Naga guards the stair"],
						treasure_and_rewards: ["Sunblade"],
						todo_checklist: ["Print the map"],
					})
				),
			]);
			listPlanningTasks.mockResolvedValue([
				{ id: "task-1", title: "Statblock the naga", description: null },
			]);
			getActiveRulesForCampaign.mockResolvedValue([
				{
					id: "r1",
					name: "Flanking",
					category: "combat",
					text: "Flanking grants advantage.",
					source: "house",
					active: true,
				},
			]);
			stubEntities({
				npcs: [
					entity("npc-1", "npcs", "Vex Ashford", {
						goals: "Buy back the debt",
					}),
				],
				monsters: [entity("mon-1", "monsters", "Bone Naga", { cr: "4" })],
				items: [entity("item-1", "items", "Sunblade", { rarity: "rare" })],
				hooks: [],
			});

			const runsheet = await RunsheetAssemblyService.assemble({} as never, {
				campaignId: "campaign-1",
				sessionNumber: 3,
			});

			expect(runsheet.recap.fromSessionNumber).toBe(2);
			expect(runsheet.recap.keyEvents).toEqual(["The bridge fell"]);
			expect(runsheet.plan.beats).toEqual(["Open in the ruined chapel"]);
			expect(runsheet.plan.openTasks).toHaveLength(1);
			expect(runsheet.plan.todoChecklist).toEqual(["Print the map"]);
			expect(runsheet.cast[0].hook).toBe("Buy back the debt");
			expect(runsheet.encounters[0].statblock).toEqual({ CR: "4" });
			expect(runsheet.loot[0].detail).toBe("(rare)");
			expect(runsheet.rules).toHaveLength(1);
			expect(runsheet.openThreads).toHaveLength(1);
			expect(runsheet.notes).toBe("");
			expect(runsheet.emptySections).toEqual([]);
		});

		it("scopes planning tasks to the runsheet's session and open statuses", async () => {
			expect.hasAssertions();

			await RunsheetAssemblyService.assemble({} as never, {
				campaignId: "campaign-1",
				sessionNumber: 7,
			});

			expect(listPlanningTasks).toHaveBeenCalledWith("campaign-1", {
				status: ["pending", "in_progress"],
				targetSessionNumber: 7,
			});
		});

		// The point of the feature is that assembly is free; a fresh generation would
		// undo that.
		it("makes no LLM call — every input is read from the database", async () => {
			expect.hasAssertions();

			await RunsheetAssemblyService.assemble({} as never, {
				campaignId: "campaign-1",
				sessionNumber: 3,
			});

			expect(getSessionDigestsByCampaign).toHaveBeenCalledWith("campaign-1");
			expect(listEntitiesByCampaign).toHaveBeenCalled();
			expect(getActiveRulesForCampaign).toHaveBeenCalled();
		});

		it("reports every empty section for a campaign with no data", async () => {
			expect.hasAssertions();

			const runsheet = await RunsheetAssemblyService.assemble({} as never, {
				campaignId: "campaign-1",
				sessionNumber: 1,
			});

			expect(runsheet.emptySections).toEqual([
				"recap",
				"plan",
				"cast",
				"encounters",
				"loot",
				"rules",
				"openThreads",
			]);
			expect(runsheet.recap.source).toBeNull();
		});

		it("excludes staged and rejected entities from enrichment lookups", async () => {
			expect.hasAssertions();

			await RunsheetAssemblyService.assemble({} as never, {
				campaignId: "campaign-1",
				sessionNumber: 3,
			});

			for (const call of listEntitiesByCampaign.mock.calls) {
				expect(call[1].excludeShardStatuses).toEqual([
					"staging",
					"rejected",
					"deleted",
				]);
			}
		});
	});
});
