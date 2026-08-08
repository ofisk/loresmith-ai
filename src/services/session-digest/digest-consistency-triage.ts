/**
 * Deterministic triage for the digest consistency check.
 *
 * `DigestQualityService.checkConsistencyWithGraphRAG` is the most expensive
 * thing in quality scoring, and the cost is not the `PIPELINE_ANALYSIS` call at
 * the end of it. Before that call it runs, unconditionally:
 *
 * 1. `EntityExtractionService.extractEntities` over the whole digest — that is
 *    `PIPELINE_STRUCTURED`, i.e. Sonnet 5;
 * 2. an embedding request for every extracted entity name;
 * 3. a vector search plus entity/relationship reads per entity;
 * 4. the Haiku consistency call.
 *
 * The two-stage shape `ContinuityAdjudicationService` uses — cheap triage,
 * expensive adjudication only on survivors — applies directly, and the cheap
 * signal is already free: a digest with no narrative text has nothing for a
 * consistency pass to contradict.
 *
 * Split the same way #759 established and #765/#790 reused:
 *
 * - `triageDigestConsistencyDecisively` — rules that cannot be wrong, and which
 *   therefore short-circuit. Today only the empty case, which is provably
 *   outcome-preserving (see below).
 * - `triageDigestConsistencyAdvisory` — the broader rule set, evaluated on every
 *   run and logged against what the expensive path actually found, but never
 *   routed on. That measurement is what decides which rules get promoted.
 *
 * **Why the decisive rule changes no outcome.** `checkConsistencyWithGraphRAG`
 * already returns `[]` when extraction yields no entities. A digest whose
 * narrative fields are all blank renders to nothing but static section headers,
 * from which no entity can be extracted — so the expensive path's result is `[]`
 * either way. Skipping it removes the spend, not a finding.
 */

import type { SessionDigestData } from "@/types/session-digest";

export type DigestConsistencyVerdict =
	/** Confidently nothing to check — skip the GraphRAG consistency pass. */
	| "skip"
	/** Confidently worth checking. */
	| "check"
	/** Genuinely unclear — run the expensive path. */
	| "ambiguous";

export interface DigestConsistencyTriageMatch {
	verdict: DigestConsistencyVerdict;
	/** Stable identifier so the log drain can group by rule. */
	rule: string;
	/** Short human-readable justification; safe to log (carries no digest text). */
	reason: string;
}

/**
 * Entry counts a consistency pass can act on.
 *
 * Deliberately ignores `todo_checklist`: it holds GM chores ("book the room",
 * "print maps"), not campaign facts, so it can be non-empty while the digest
 * still describes no fiction to be inconsistent about.
 */
export interface DigestSubstanceStats {
	/** Non-blank entries across every narrative field. */
	narrativeEntries: number;
	/** Non-blank entries in the recap specifically (what consistency compares). */
	recapEntries: number;
	/** Entries containing a capitalised word — proper-noun shaped. */
	namedEntryCount: number;
	/** Total characters of narrative text. */
	narrativeChars: number;
}

function nonBlank(values: readonly string[] | undefined): string[] {
	return (values ?? []).filter((value) => value.trim().length > 0);
}

/**
 * A capitalised word that is not the first word of the entry.
 *
 * Leading capitals are just sentence case and say nothing about proper nouns;
 * a mid-entry capital is the cheap signal that a name is present.
 */
const INTERIOR_CAPITAL = /\s[A-Z][a-z]{2,}/;

/** Narrative fields, in the order they contribute to consistency checking. */
function recapEntriesOf(digest: SessionDigestData): string[] {
	const recap = digest.last_session_recap;
	return [
		...nonBlank(recap?.key_events),
		...nonBlank(recap?.state_changes?.factions),
		...nonBlank(recap?.state_changes?.locations),
		...nonBlank(recap?.state_changes?.npcs),
		...nonBlank(recap?.open_threads),
	];
}

function planEntriesOf(digest: SessionDigestData): string[] {
	const plan = digest.next_session_plan;
	return [
		...nonBlank(plan?.objectives_dm),
		...nonBlank(plan?.probable_player_goals),
		...nonBlank(plan?.beats),
		...nonBlank(plan?.if_then_branches),
		...nonBlank(digest.npcs_to_run),
		...nonBlank(digest.locations_in_focus),
		...nonBlank(digest.encounter_seeds),
		...nonBlank(digest.clues_and_revelations),
		...nonBlank(digest.treasure_and_rewards),
	];
}

/** Measure a digest's substance. Pure and cheap — no allocation worth caching. */
export function measureDigestSubstance(
	digest: SessionDigestData
): DigestSubstanceStats {
	const recap = recapEntriesOf(digest);
	const plan = planEntriesOf(digest);
	const all = [...recap, ...plan];
	return {
		narrativeEntries: all.length,
		recapEntries: recap.length,
		namedEntryCount: all.filter((entry) => INTERIOR_CAPITAL.test(entry)).length,
		narrativeChars: all.reduce((sum, entry) => sum + entry.trim().length, 0),
	};
}

/**
 * Rules confident enough to skip the expensive consistency pass.
 *
 * Only the empty case, because only it is provably outcome-preserving. Anything
 * that trades a real chance of a missed inconsistency for tokens belongs in the
 * advisory set until the logs say otherwise — a digest is GM-facing prep, and a
 * contradiction that reaches the table is worth more than the call that found
 * it.
 */
export function triageDigestConsistencyDecisively(
	digest: SessionDigestData
): DigestConsistencyTriageMatch | null {
	const stats = measureDigestSubstance(digest);

	if (stats.narrativeEntries === 0) {
		return {
			verdict: "skip",
			rule: "no-narrative-content",
			reason:
				"every narrative field is empty; entity extraction has nothing to read",
		};
	}

	return null;
}

/**
 * Entries below which a digest is probably too thin for a consistency pass to
 * find anything. Advisory only.
 */
const THIN_DIGEST_ENTRY_COUNT = 3;

/** Characters below which the whole digest is barely a sentence. */
const THIN_DIGEST_CHAR_COUNT = 80;

/**
 * The full rule set — evaluated on every consistency check, never acted on.
 *
 * Its agreement with the expensive path is logged so a per-rule "did this ever
 * suppress a real finding?" rate exists before anything here is promoted.
 */
export function triageDigestConsistencyAdvisory(
	digest: SessionDigestData
): DigestConsistencyTriageMatch {
	const stats = measureDigestSubstance(digest);

	const decisive = triageDigestConsistencyDecisively(digest);
	if (decisive) {
		return decisive;
	}

	if (stats.narrativeChars < THIN_DIGEST_CHAR_COUNT) {
		return {
			verdict: "skip",
			rule: "below-minimum-length",
			reason: `only ${stats.narrativeChars} characters of narrative text`,
		};
	}

	// Consistency compares the digest against entities already in the graph. With
	// no proper-noun-shaped entry there is likely nothing that will match one.
	if (stats.namedEntryCount === 0) {
		return {
			verdict: "skip",
			rule: "no-named-entities",
			reason: "no entry contains a proper-noun-shaped word",
		};
	}

	if (
		stats.recapEntries === 0 &&
		stats.narrativeEntries < THIN_DIGEST_ENTRY_COUNT
	) {
		return {
			verdict: "skip",
			rule: "forward-looking-only",
			reason:
				"no recap entries and few plan entries; nothing recorded to contradict",
		};
	}

	if (
		stats.recapEntries >= THIN_DIGEST_ENTRY_COUNT &&
		stats.namedEntryCount > 0
	) {
		return {
			verdict: "check",
			rule: "substantive-recap",
			reason: `${stats.recapEntries} recap entries with named subjects`,
		};
	}

	return {
		verdict: "ambiguous",
		rule: "none",
		reason: "no rule matched confidently",
	};
}
