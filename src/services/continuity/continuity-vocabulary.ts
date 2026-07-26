/**
 * Status vocabularies used to read free-text world state into coarse buckets.
 *
 * World state statuses are written by the extraction pipeline, not by a fixed
 * enum, so the detectors match on keywords. Buckets are deliberately coarse:
 * their job is to *narrow candidates*, and the model tiers decide what is
 * actually a contradiction.
 */

/** Statuses meaning the subject is permanently removed from play. */
const REMOVED_KEYWORDS = [
	"dead",
	"deceased",
	"died",
	"dies",
	"killed",
	"slain",
	"murdered",
	"executed",
	"destroyed",
	"razed",
	"demolished",
	"annihilated",
	"disbanded",
	"dissolved",
	"obliterated",
];

/** Statuses meaning the subject is absent but could plausibly return. */
const ABSENT_KEYWORDS = [
	"departed",
	"left",
	"gone",
	"missing",
	"vanished",
	"disappeared",
	"exiled",
	"banished",
	"imprisoned",
	"captured",
	"abducted",
	"fled",
	"petrified",
	"comatose",
	"unconscious",
];

/** Statuses that explicitly undo a removal or absence. */
const RESTORED_KEYWORDS = [
	"alive",
	"revived",
	"resurrected",
	"reborn",
	"returned",
	"rebuilt",
	"restored",
	"escaped",
	"freed",
	"released",
	"rescued",
	"reformed",
	"recovered",
];

const ALLIED_KEYWORDS = [
	"ally",
	"allied",
	"alliance",
	"friendly",
	"friend",
	"peace",
	"peaceful",
	"truce",
	"cooperative",
	"trusted",
	"supportive",
	"pact",
];

const HOSTILE_KEYWORDS = [
	"hostile",
	"enemy",
	"enemies",
	"war",
	"at war",
	"rival",
	"feud",
	"betrayed",
	"betrayal",
	"opposed",
	"antagonistic",
	"vendetta",
	"hunted",
];

export type EntityStatusBucket = "removed" | "absent" | "restored" | "other";
export type RelationshipPolarity = "allied" | "hostile" | "neutral";

function matchesAny(value: string, keywords: string[]): boolean {
	const normalized = value.toLowerCase();
	return keywords.some((keyword) =>
		new RegExp(`(?<![\\p{L}])${keyword}(?![\\p{L}])`, "u").test(normalized)
	);
}

/**
 * Bucket a free-text entity status.
 *
 * `restored` is checked first: "resurrected but still legally dead" should read
 * as restored, and a status mentioning both is far more likely to be a return
 * than a fresh death.
 */
export function classifyEntityStatus(
	status: string | undefined | null
): EntityStatusBucket {
	if (!status) return "other";
	if (matchesAny(status, RESTORED_KEYWORDS)) return "restored";
	if (matchesAny(status, REMOVED_KEYWORDS)) return "removed";
	if (matchesAny(status, ABSENT_KEYWORDS)) return "absent";
	return "other";
}

export function classifyRelationshipStatus(
	status: string | undefined | null
): RelationshipPolarity {
	if (!status) return "neutral";
	if (matchesAny(status, HOSTILE_KEYWORDS)) return "hostile";
	if (matchesAny(status, ALLIED_KEYWORDS)) return "allied";
	return "neutral";
}

/** Phrases that mark a sentence as a table ruling rather than narration. */
const RULING_MARKERS = [
	"house rule",
	"houserule",
	"we ruled",
	"i ruled",
	"ruled that",
	"we decided",
	"table rule",
	"from now on",
	"going forward",
	"rule change",
	"we agreed",
	"errata",
	"we're using",
	"we are using",
];

/** True when a digest line reads like a ruling the table made. */
export function looksLikeRuling(text: string): boolean {
	const normalized = text.toLowerCase();
	return RULING_MARKERS.some((marker) => normalized.includes(marker));
}
