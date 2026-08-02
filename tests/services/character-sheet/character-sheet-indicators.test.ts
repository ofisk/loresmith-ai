import { describe, expect, it } from "vitest";
import {
	classifyCharacterSheetAdvisory,
	classifyCharacterSheetDecisively,
	scoreCharacterSheetIndicators,
} from "../../../src/services/character-sheet/character-sheet-indicators";

/** Campaign prose: English, substantial, and carrying no sheet vocabulary. */
const SESSION_NOTES = `The party arrived at the crossing well after dark and found the ferryman gone.
His hut was open and the fire had burned down to nothing, which the group read as
a bad sign rather than a coincidence. They argued about whether to wait until
morning or take the boat themselves, and in the end they took it, poling across
in near silence while the current pulled them steadily east of where they meant
to land. On the far bank they found a cart turned on its side and the marks of
something heavy dragged away from it toward the treeline. Nobody wanted to follow
those marks in the dark, so they made camp against the overturned cart and set a
watch. Around the third watch the youngest of them heard singing from somewhere
out past the trees, faint and in no language she recognised, and she woke the
others rather than investigate alone. By dawn the singing had stopped and the
drag marks were gone, brushed over so carefully that only the ferryman's dog,
which turned up sometime before sunrise, seemed to know where they had led.`;

/** A minimal but unmistakable sheet, deliberately not D&D. */
const COC_SHEET = `INVESTIGATOR SHEET
Character Name: Eleanor Vance
Occupation: Journalist   Age: 34
Strength 55  Constitution 60  Power 70  Dexterity 65
Appearance 60  Size 50  Intelligence 75  Education 80
Hit Points: 11   Sanity: 70   Luck: 55
Skills: Library Use 70%, Persuade 55%, Spot Hidden 45%, Occult 20%
Equipment: notebook, .38 revolver, electric torch, press credentials
Backstory: came to Arkham chasing a story about the Miskatonic dig.`;

describe("scoreCharacterSheetIndicators", () => {
	it("counts distinct concept groups, not repeated hits", () => {
		const repeated = scoreCharacterSheetIndicators(
			"hit points hit points hit points hit points"
		);
		expect(repeated.groupsMatched).toBe(1);
		expect(repeated.matchedGroups).toEqual(["vitality"]);
	});

	it("recognises a non-D&D sheet through system-agnostic vocabulary", () => {
		const score = scoreCharacterSheetIndicators(COC_SHEET);
		expect(score.groupsMatched).toBeGreaterThanOrEqual(6);
		expect(score.matchedGroups).toContain("attributes");
		expect(score.matchedGroups).toContain("equipment");
	});
});

describe("classifyCharacterSheetDecisively", () => {
	it("rejects empty content", () => {
		expect(classifyCharacterSheetDecisively("")?.rule).toBe(
			"empty-or-whitespace"
		);
		expect(classifyCharacterSheetDecisively("  \n\t ")?.verdict).toBe(
			"not-character-sheet"
		);
	});

	it("skips the model for substantial English prose with no sheet vocabulary", () => {
		const match = classifyCharacterSheetDecisively(SESSION_NOTES);
		expect(match?.rule).toBe("no-indicators-in-english-prose");
		expect(match?.verdict).toBe("not-character-sheet");
	});

	it("defers on non-English text, where an absent English keyword proves nothing", () => {
		// Same shape of document, no English connective words. The absence rule
		// must not fire here: a French sheet has to reach the model.
		const french = Array(40)
			.fill(
				"Le bateau glissait sur une eau lourde pendant que les voyageurs se taisaient."
			)
			.join(" ");
		expect(classifyCharacterSheetDecisively(french)).toBeNull();
	});

	it("defers on short text, where an absence is not yet meaningful", () => {
		expect(
			classifyCharacterSheetDecisively("A short note about the road.")
		).toBe(null);
	});

	it("never decisively accepts — a positive always costs a model call", () => {
		expect(classifyCharacterSheetDecisively(COC_SHEET)).toBeNull();
	});
});

describe("classifyCharacterSheetAdvisory", () => {
	it("calls a dense, short document a character sheet", () => {
		const match = classifyCharacterSheetAdvisory(COC_SHEET);
		expect(match.verdict).toBe("character-sheet");
		expect(match.rule).toBe("dense-indicator-coverage");
	});

	it("calls a long document reference material regardless of coverage", () => {
		const rulebook = `${COC_SHEET}\n`.repeat(2000);
		expect(rulebook.length).toBeGreaterThan(60_000);
		const match = classifyCharacterSheetAdvisory(rulebook);
		expect(match.verdict).toBe("not-character-sheet");
		expect(match.rule).toBe("rulebook-length");
	});

	it("defers when coverage falls between the confident bands", () => {
		const middling =
			"Notes on the caravan: the guards carry weapons and armour, and the " +
			"caravan master keeps a ledger of every skill he has had to hire for. " +
			"He will not say what the third wagon holds. ".repeat(4);
		const match = classifyCharacterSheetAdvisory(middling);
		expect(["ambiguous", "not-character-sheet"]).toContain(match.verdict);
	});

	it("passes decisive matches straight through", () => {
		expect(classifyCharacterSheetAdvisory(SESSION_NOTES).rule).toBe(
			"no-indicators-in-english-prose"
		);
	});
});
