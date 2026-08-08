import { describe, expect, it } from "vitest";
import {
	measureDigestSubstance,
	triageDigestConsistencyAdvisory,
	triageDigestConsistencyDecisively,
} from "@/services/session-digest/digest-consistency-triage";
import type { SessionDigestData } from "@/types/session-digest";

const EMPTY_DIGEST: SessionDigestData = {
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
};

function digest(overrides: Partial<SessionDigestData>): SessionDigestData {
	return {
		...EMPTY_DIGEST,
		...overrides,
		last_session_recap: {
			...EMPTY_DIGEST.last_session_recap,
			...overrides.last_session_recap,
		},
		next_session_plan: {
			...EMPTY_DIGEST.next_session_plan,
			...overrides.next_session_plan,
		},
	};
}

describe("measureDigestSubstance", () => {
	it("ignores whitespace-only entries", () => {
		const stats = measureDigestSubstance(
			digest({
				last_session_recap: {
					key_events: ["   ", "\n\t", ""],
					state_changes: { factions: [], locations: [], npcs: [] },
					open_threads: [],
				},
			})
		);
		expect(stats.narrativeEntries).toBe(0);
	});

	it("excludes the todo checklist, which holds GM chores rather than fiction", () => {
		const stats = measureDigestSubstance(
			digest({ todo_checklist: ["Print the maps", "Book the room"] })
		);
		expect(stats.narrativeEntries).toBe(0);
	});

	it("counts recap entries separately from plan entries", () => {
		const stats = measureDigestSubstance(
			digest({
				last_session_recap: {
					key_events: ["The party fled Ravenhollow"],
					state_changes: { factions: [], locations: [], npcs: [] },
					open_threads: [],
				},
				npcs_to_run: ["Sera the smith"],
			})
		);
		expect(stats.recapEntries).toBe(1);
		expect(stats.narrativeEntries).toBe(2);
	});

	it("treats a mid-entry capital as a proper noun but not a leading one", () => {
		const leadingOnly = measureDigestSubstance(
			digest({ npcs_to_run: ["Someone opened the door"] })
		);
		expect(leadingOnly.namedEntryCount).toBe(0);

		const interior = measureDigestSubstance(
			digest({ npcs_to_run: ["the party met Sera"] })
		);
		expect(interior.namedEntryCount).toBe(1);
	});
});

describe("triageDigestConsistencyDecisively", () => {
	it("skips a digest with no narrative content", () => {
		const match = triageDigestConsistencyDecisively(EMPTY_DIGEST);
		expect(match?.verdict).toBe("skip");
		expect(match?.rule).toBe("no-narrative-content");
	});

	it("skips when every narrative entry is whitespace", () => {
		const match = triageDigestConsistencyDecisively(
			digest({
				last_session_recap: {
					key_events: ["  "],
					state_changes: { factions: [""], locations: [], npcs: [] },
					open_threads: ["\t"],
				},
			})
		);
		expect(match?.verdict).toBe("skip");
	});

	// The decisive rule is the only one allowed to change behaviour, so anything
	// carrying content must fall through to the expensive pass. A digest that
	// mentions something a GM could contradict is worth the model call.
	it("does not skip a digest with a single real entry", () => {
		expect(
			triageDigestConsistencyDecisively(
				digest({ npcs_to_run: ["Sera the smith"] })
			)
		).toBeNull();
	});

	it("does not skip a thin digest, however unpromising", () => {
		expect(
			triageDigestConsistencyDecisively(digest({ encounter_seeds: ["a"] }))
		).toBeNull();
	});

	it("does not skip when only the todo checklist is empty", () => {
		expect(
			triageDigestConsistencyDecisively(
				digest({
					last_session_recap: {
						key_events: ["The party burned the Ledger of Ash"],
						state_changes: { factions: [], locations: [], npcs: [] },
						open_threads: [],
					},
				})
			)
		).toBeNull();
	});
});

describe("triageDigestConsistencyAdvisory", () => {
	it("reports the decisive verdict when one applies", () => {
		const advisory = triageDigestConsistencyAdvisory(EMPTY_DIGEST);
		expect(advisory.verdict).toBe("skip");
		expect(advisory.rule).toBe("no-narrative-content");
	});

	it("flags a digest with no proper-noun-shaped entry", () => {
		const advisory = triageDigestConsistencyAdvisory(
			digest({
				last_session_recap: {
					key_events: [
						"they walked for a long while and then rested by the water",
						"nothing much happened after that, so they made camp again",
					],
					state_changes: { factions: [], locations: [], npcs: [] },
					open_threads: [],
				},
			})
		);
		expect(advisory.verdict).toBe("skip");
		expect(advisory.rule).toBe("no-named-entities");
	});

	it("flags a digest that is barely a sentence", () => {
		const advisory = triageDigestConsistencyAdvisory(
			digest({ npcs_to_run: ["met Sera"] })
		);
		expect(advisory.verdict).toBe("skip");
		expect(advisory.rule).toBe("below-minimum-length");
	});

	it("flags a forward-looking digest with nothing recorded to contradict", () => {
		const advisory = triageDigestConsistencyAdvisory(
			digest({
				next_session_plan: {
					objectives_dm: [
						"the party should eventually reach Ravenhollow and speak to the smith there about the road north",
					],
					probable_player_goals: [],
					beats: [],
					if_then_branches: [],
				},
			})
		);
		expect(advisory.verdict).toBe("skip");
		expect(advisory.rule).toBe("forward-looking-only");
	});

	it("says check for a substantive recap with named subjects", () => {
		const advisory = triageDigestConsistencyAdvisory(
			digest({
				last_session_recap: {
					key_events: [
						"the party burned the Ledger of Ash in the undercroft",
						"they bargained with Sera for safe passage north",
					],
					state_changes: {
						factions: ["the Ashen Court now considers them outlaws"],
						locations: [],
						npcs: [],
					},
					open_threads: ["who warned the Court before they arrived"],
				},
			})
		);
		expect(advisory.verdict).toBe("check");
		expect(advisory.rule).toBe("substantive-recap");
	});

	// An unmatched digest must defer rather than guess: `ambiguous` is recorded as
	// a deferral in the telemetry, not counted as agreement either way.
	it("defers when no rule matches confidently", () => {
		const advisory = triageDigestConsistencyAdvisory(
			digest({
				last_session_recap: {
					key_events: [
						"the party spoke with Sera for some time about the road north and what waits along it",
					],
					state_changes: { factions: [], locations: [], npcs: [] },
					open_threads: [],
				},
			})
		);
		expect(advisory.verdict).toBe("ambiguous");
	});
});
