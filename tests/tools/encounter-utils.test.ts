import { describe, expect, it } from "vitest";
import {
	buildGeneralCombatAdvice,
	buildRoleBasedUsageAdvice,
	DIFFICULTY_RANK,
	formatPlanningSignal,
	inferRole,
	splitKeywords,
	toWordSet,
} from "@/tools/campaign-context/encounter-utils";

describe("encounter-utils", () => {
	describe("DIFFICULTY_RANK", () => {
		it("maps each difficulty to expected numeric rank", () => {
			expect(DIFFICULTY_RANK.easy).toBe(1);
			expect(DIFFICULTY_RANK.medium).toBe(2);
			expect(DIFFICULTY_RANK.hard).toBe(3);
			expect(DIFFICULTY_RANK.deadly).toBe(4);
		});
	});

	describe("toWordSet", () => {
		it("splits text into lowercase tokens of 3+ chars", () => {
			const set = toWordSet("Hello World Foo Bar");
			expect(set).toEqual(new Set(["hello", "world", "foo", "bar"]));
		});

		it("filters out short tokens", () => {
			const set = toWordSet("a bc def ghi");
			expect(set).toEqual(new Set(["def", "ghi"]));
		});

		it("handles undefined/empty", () => {
			expect(toWordSet(undefined)).toEqual(new Set());
			expect(toWordSet("")).toEqual(new Set());
		});

		it("strips non-alphanumeric and collapses whitespace", () => {
			const set = toWordSet("  forest  glade; swamp... ");
			expect(set).toEqual(new Set(["forest", "glade", "swamp"]));
		});
	});

	describe("splitKeywords", () => {
		it("returns array from toWordSet", () => {
			expect(splitKeywords("foo bar baz")).toEqual(
				expect.arrayContaining(["foo", "bar", "baz"])
			);
		});
	});

	describe("inferRole", () => {
		const mkEntity = (name: string, content?: unknown) =>
			({ name, content: content ?? {} }) as any;

		it("returns ranged pressure for sniper/archer/ranged", () => {
			expect(inferRole(mkEntity("Sniper Goblin"))).toBe("ranged pressure");
			expect(inferRole(mkEntity("Archer Elf"))).toBe("ranged pressure");
		});

		it("returns frontline brute for brute/ogre/giant", () => {
			expect(inferRole(mkEntity("Ogre Brute"))).toBe("frontline brute");
			expect(inferRole(mkEntity("Hill Giant"))).toBe("frontline brute");
		});

		it("returns spell support for mage/shaman/priest", () => {
			expect(inferRole(mkEntity("Dark Mage"))).toBe("spell support");
			expect(inferRole(mkEntity("Shaman"))).toBe("spell support");
		});

		it("returns mobile skirmisher for assassin/skirmish", () => {
			expect(inferRole(mkEntity("Assassin"))).toBe("mobile skirmisher");
		});

		it("returns command leader for leader/captain/boss", () => {
			expect(inferRole(mkEntity("Goblin Chief"))).toBe("command leader");
			expect(inferRole(mkEntity("Boss Monster"))).toBe("command leader");
		});

		it("returns general combatant for unknown", () => {
			expect(inferRole(mkEntity("Random Creature"))).toBe("general combatant");
		});
	});

	describe("buildRoleBasedUsageAdvice", () => {
		it("returns advice for role and threat band", () => {
			const advice = buildRoleBasedUsageAdvice({
				role: "ranged pressure",
				threatBand: "standard",
				linkedFactions: [],
				linkedLocations: [],
			});
			expect(advice.length).toBeGreaterThan(0);
			expect(advice.length).toBeLessThanOrEqual(4);
			expect(advice[0]).toContain("cover");
		});

		it("adds high threat advice when threatBand is high", () => {
			const advice = buildRoleBasedUsageAdvice({
				role: "general combatant",
				threatBand: "high",
				linkedFactions: [],
				linkedLocations: [],
			});
			expect(advice.some((a) => a.includes("Telegraph"))).toBe(true);
		});

		it("adds faction context when linkedFactions provided", () => {
			const advice = buildRoleBasedUsageAdvice({
				role: "general combatant",
				threatBand: "standard",
				linkedFactions: ["Red Hand"],
				linkedLocations: [],
			});
			expect(advice.some((a) => a.includes("Red Hand"))).toBe(true);
		});

		it("caps at 4 items", () => {
			const advice = buildRoleBasedUsageAdvice({
				role: "command leader",
				threatBand: "high",
				linkedFactions: ["Faction"],
				linkedLocations: ["Location"],
			});
			expect(advice.length).toBeLessThanOrEqual(4);
		});
	});

	describe("buildGeneralCombatAdvice", () => {
		it("returns base advice", () => {
			const advice = buildGeneralCombatAdvice({
				targetDifficulty: "medium",
				partySize: 4,
				composition: [],
			});
			expect(advice.length).toBeGreaterThan(0);
			expect(advice.length).toBeLessThanOrEqual(6);
		});

		it("adds role diversity advice when 3+ roles", () => {
			const advice = buildGeneralCombatAdvice({
				targetDifficulty: "medium",
				partySize: 4,
				composition: [
					{ role: "ranged pressure", count: 1 },
					{ role: "frontline brute", count: 1 },
					{ role: "spell support", count: 1 },
				],
			});
			expect(advice.some((a) => a.includes("Sequence turns"))).toBe(true);
		});

		it("adds deadly advice for deadly difficulty", () => {
			const advice = buildGeneralCombatAdvice({
				targetDifficulty: "deadly",
				partySize: 4,
				composition: [],
			});
			expect(advice.some((a) => a.includes("fail-forward"))).toBe(true);
		});

		it("adds large party advice for partySize >= 5", () => {
			const advice = buildGeneralCombatAdvice({
				targetDifficulty: "medium",
				partySize: 6,
				composition: [],
			});
			expect(advice.some((a) => a.includes("layered"))).toBe(true);
		});
	});

	describe("formatPlanningSignal", () => {
		it("formats section and content", () => {
			const out = formatPlanningSignal({
				sectionType: "encounter",
				sectionContent: "A goblin ambush in the forest",
			});
			expect(out).toBe("encounter: A goblin ambush in the forest");
		});

		it("uses note and empty string when missing", () => {
			expect(formatPlanningSignal({})).toBe("note: ");
		});

		it("truncates long content", () => {
			const long = "x".repeat(300);
			const out = formatPlanningSignal({
				sectionType: "a",
				sectionContent: long,
			});
			expect(out.length).toBeLessThanOrEqual(230);
		});

		it("collapses whitespace", () => {
			const out = formatPlanningSignal({
				sectionType: "x",
				sectionContent: "a   b\n\tc",
			});
			expect(out).toBe("x: a b c");
		});
	});
});
