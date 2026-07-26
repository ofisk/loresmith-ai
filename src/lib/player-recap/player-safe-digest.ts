/**
 * Reduce a session digest to the subset that is safe to mail to players.
 *
 * This is deliberately an *allowlist*. `sanitizeDigestForPlayer` in
 * `src/routes/session-digests.ts` blanks two known-unsafe fields and passes the
 * rest through, which is fine for an in-app view the GM can correct but wrong
 * for an email that cannot be recalled: any field added to `SessionDigestData`
 * later would ship to players before anyone noticed.
 *
 * Here, only fields under `last_session_recap` are read at all. Everything
 * forward-looking has no representation in `PlayerSafeRecap`:
 *
 *   next_session_plan.objectives_dm    GM intent for the coming session
 *   next_session_plan.if_then_branches contingency plans
 *   next_session_plan.beats            plot beats not yet played
 *   next_session_plan.probable_player_goals  GM's read on the party
 *   npcs_to_run                        NPCs prepared for the *next* session
 *   locations_in_focus                 locations prepared for the next session
 *   encounter_seeds                    unsprung encounters
 *   clues_and_revelations              unrevealed twists
 *   treasure_and_rewards               unearned loot
 *   todo_checklist                     GM prep notes
 */

import type { PlayerSafeRecap } from "@/types/player-recap";
import type { SessionDigestData } from "@/types/session-digest";

function cleanList(values: string[] | undefined): string[] {
	if (!Array.isArray(values)) return [];
	return values
		.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

/**
 * Extract the player-safe view of a digest.
 *
 * Only `last_session_recap` is read: those fields describe what already
 * happened at the table, which the players were present for.
 */
export function toPlayerSafeRecap(digest: SessionDigestData): PlayerSafeRecap {
	const recap = digest?.last_session_recap;
	const stateChanges = recap?.state_changes;

	return {
		whatHappened: cleanList(recap?.key_events),
		notableNpcs: cleanList(stateChanges?.npcs),
		placesVisited: cleanList(stateChanges?.locations),
		factionDevelopments: cleanList(stateChanges?.factions),
		unresolvedThreads: cleanList(recap?.open_threads),
	};
}

/** True when there is nothing worth mailing. */
export function isPlayerSafeRecapEmpty(recap: PlayerSafeRecap): boolean {
	return (
		recap.whatHappened.length === 0 &&
		recap.notableNpcs.length === 0 &&
		recap.placesVisited.length === 0 &&
		recap.factionDevelopments.length === 0 &&
		recap.unresolvedThreads.length === 0
	);
}

/**
 * Phrases that suggest a line describes something the players do not know.
 *
 * The allowlist above bounds *which fields* are read; it cannot tell whether a
 * GM wrote an off-screen development into `state_changes` ("the cult secretly
 * relocated"). Rather than silently deleting such lines — which would give the
 * filter false authority and mangle legitimate prose — we surface them to the
 * GM so the review step has something concrete to look at.
 */
const SPOILER_SIGNAL_PATTERNS: RegExp[] = [
	/\bsecretly\b/i,
	/\bunbeknownst\b/i,
	/\bwithout the (?:party|players|pcs) knowing\b/i,
	/\bthe (?:party|players|pcs) (?:do|does|did) not (?:yet )?know\b/i,
	/\bplayers? (?:don't|do not) know\b/i,
	/\bactually (?:is|was|works for|serves)\b/i,
	/\bin truth\b/i,
	/\breally (?:is|was) (?:a|an|the)\b/i,
	/\btrue identity\b/i,
	/\bhidden (?:agenda|motive|identity)\b/i,
	/\bforeshadow/i,
	/\boff[- ]screen\b/i,
	/\bbehind the scenes\b/i,
	/\bwill (?:later|eventually) (?:reveal|betray|turn)\b/i,
	/\btwist\b/i,
	/\bspoiler/i,
];

export interface SpoilerFlag {
	/** Which part of the recap the line came from. */
	section: keyof PlayerSafeRecap;
	/** Index of the line within that section. */
	index: number;
	/** The line itself. */
	text: string;
	/** The phrase that triggered the flag. */
	match: string;
}

/**
 * Flag lines that read like GM-only knowledge.
 *
 * Advisory only — nothing is removed. The GM review UI highlights these so the
 * reviewer's attention lands where it matters most.
 */
export function flagPotentialSpoilers(recap: PlayerSafeRecap): SpoilerFlag[] {
	const flags: SpoilerFlag[] = [];
	const sections: Array<keyof PlayerSafeRecap> = [
		"whatHappened",
		"notableNpcs",
		"placesVisited",
		"factionDevelopments",
		"unresolvedThreads",
	];

	for (const section of sections) {
		recap[section].forEach((text, index) => {
			for (const pattern of SPOILER_SIGNAL_PATTERNS) {
				const found = text.match(pattern);
				if (found) {
					flags.push({ section, index, text, match: found[0] });
					break;
				}
			}
		});
	}

	return flags;
}
