import { describe, expect, it } from "vitest";
import {
	flagPotentialSpoilers,
	isPlayerSafeRecapEmpty,
	toPlayerSafeRecap,
} from "@/lib/player-recap/player-safe-digest";
import type { SessionDigestData } from "@/types/session-digest";

/** A digest where every GM-only field carries a unique, greppable marker. */
function digestWithSpoilers(): SessionDigestData {
	return {
		last_session_recap: {
			key_events: ["The party broke the siege of Cairnhold"],
			state_changes: {
				factions: ["The Ashen Hand lost their eastern garrison"],
				locations: ["Cairnhold's outer wall is rubble"],
				npcs: ["Captain Yorel joined the party's cause"],
			},
			open_threads: ["Who paid the Ashen Hand to attack?"],
		},
		next_session_plan: {
			objectives_dm: ["SPOILER_OBJECTIVES"],
			probable_player_goals: ["SPOILER_PLAYER_GOALS"],
			beats: ["SPOILER_BEATS"],
			if_then_branches: ["SPOILER_BRANCHES"],
		},
		npcs_to_run: ["SPOILER_NPCS_TO_RUN"],
		locations_in_focus: ["SPOILER_LOCATIONS_IN_FOCUS"],
		encounter_seeds: ["SPOILER_ENCOUNTER_SEEDS"],
		clues_and_revelations: ["SPOILER_CLUES"],
		treasure_and_rewards: ["SPOILER_TREASURE"],
		todo_checklist: ["SPOILER_TODO"],
	};
}

describe("toPlayerSafeRecap", () => {
	it("keeps only last-session content", () => {
		const safe = toPlayerSafeRecap(digestWithSpoilers());

		expect(safe.whatHappened).toEqual([
			"The party broke the siege of Cairnhold",
		]);
		expect(safe.notableNpcs).toEqual([
			"Captain Yorel joined the party's cause",
		]);
		expect(safe.placesVisited).toEqual(["Cairnhold's outer wall is rubble"]);
		expect(safe.factionDevelopments).toEqual([
			"The Ashen Hand lost their eastern garrison",
		]);
		expect(safe.unresolvedThreads).toEqual([
			"Who paid the Ashen Hand to attack?",
		]);
	});

	it("carries no GM-only field into the output, anywhere", () => {
		const serialized = JSON.stringify(toPlayerSafeRecap(digestWithSpoilers()));
		expect(serialized).not.toMatch(/SPOILER_/);
	});

	it("ignores unknown fields added to the digest later", () => {
		// The allowlist's whole point: a field nobody has reviewed for spoiler
		// safety must not reach players just because it was added upstream.
		const withNewField = {
			...digestWithSpoilers(),
			gm_private_notes: ["SPOILER_FUTURE_FIELD"],
		} as unknown as SessionDigestData;

		const serialized = JSON.stringify(toPlayerSafeRecap(withNewField));
		expect(serialized).not.toMatch(/SPOILER_FUTURE_FIELD/);
	});

	it("drops blank entries and trims whitespace", () => {
		const digest = digestWithSpoilers();
		digest.last_session_recap.key_events = ["  spaced  ", "", "   "];

		expect(toPlayerSafeRecap(digest).whatHappened).toEqual(["spaced"]);
	});

	it("survives malformed digest data without throwing", () => {
		const safe = toPlayerSafeRecap({} as SessionDigestData);
		expect(isPlayerSafeRecapEmpty(safe)).toBe(true);

		const nullish = toPlayerSafeRecap(null as unknown as SessionDigestData);
		expect(isPlayerSafeRecapEmpty(nullish)).toBe(true);
	});
});

describe("isPlayerSafeRecapEmpty", () => {
	it("is false when any section has content", () => {
		const digest = digestWithSpoilers();
		digest.last_session_recap.key_events = [];
		digest.last_session_recap.state_changes = {
			factions: [],
			locations: [],
			npcs: [],
		};

		expect(isPlayerSafeRecapEmpty(toPlayerSafeRecap(digest))).toBe(false);
	});
});

describe("flagPotentialSpoilers", () => {
	it("flags lines that read like GM-only knowledge", () => {
		const digest = digestWithSpoilers();
		digest.last_session_recap.state_changes.npcs = [
			"Captain Yorel secretly reports to the Ashen Hand",
		];

		const flags = flagPotentialSpoilers(toPlayerSafeRecap(digest));

		expect(flags).toHaveLength(1);
		expect(flags[0].section).toBe("notableNpcs");
		expect(flags[0].match).toBe("secretly");
	});

	it("returns nothing for ordinary recap prose", () => {
		expect(
			flagPotentialSpoilers(toPlayerSafeRecap(digestWithSpoilers()))
		).toEqual([]);
	});

	it("flags a line only once even if several phrases match", () => {
		const digest = digestWithSpoilers();
		digest.last_session_recap.key_events = [
			"Unbeknownst to the party, the twist is that he secretly lied",
		];

		expect(flagPotentialSpoilers(toPlayerSafeRecap(digest))).toHaveLength(1);
	});

	it("is advisory only and never removes content", () => {
		const digest = digestWithSpoilers();
		digest.last_session_recap.key_events = ["The vault secretly opened"];

		const safe = toPlayerSafeRecap(digest);
		expect(flagPotentialSpoilers(safe)).toHaveLength(1);
		expect(safe.whatHappened).toEqual(["The vault secretly opened"]);
	});
});
