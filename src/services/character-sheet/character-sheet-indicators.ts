/**
 * Deterministic pre-screen for character-sheet detection (issue #761, finding 5a).
 *
 * `CharacterSheetDetectionService` runs a model on **every uploaded file**,
 * across up to three chunks of 10,000 characters each, to answer one boolean.
 * The prompt asks the model to look for indicators — a character name, a stats
 * block, class/level, hit points, an equipment list, armour class. Those are
 * field labels, and field labels are a vocabulary match.
 *
 * Structured the way #759 established and #765 reused for the chunk gate:
 *
 * - `classifyCharacterSheetDecisively` holds only rules with no failure mode,
 *   and its answer short-circuits the model call.
 * - `classifyCharacterSheetAdvisory` holds the full rule set. It is evaluated
 *   on every detection and logged against what the model said, but never routed
 *   on. The measured agreement rate is what decides which rules get promoted.
 *
 * The one decisive rule is an *absence* rule, and absence is only meaningful in
 * a language whose vocabulary we know — so it requires English prose density
 * before it fires. A French character sheet matches no English indicator and
 * must reach the model, not be skipped. See `lib/english-prose-stats`.
 */

import { commonWordRatio, tokenizeWords } from "@/lib/english-prose-stats";

export type CharacterSheetVerdict =
	/** Confidently a character sheet. */
	| "character-sheet"
	/** Confidently not one — no model call needed. */
	| "not-character-sheet"
	/** Genuinely unclear — defer to the model. */
	| "ambiguous";

export interface CharacterSheetRuleMatch {
	verdict: CharacterSheetVerdict;
	/** Stable identifier so the log drain can group by rule. */
	rule: string;
	/** Short justification, safe to log — never contains document text. */
	reason: string;
	/** How many distinct indicator groups matched. */
	groupsMatched: number;
}

/**
 * Indicator groups, one per *concept* the detection prompt asks about, with the
 * vocabulary each concept uses across the systems this app claims to support
 * (D&D, Pathfinder, Call of Cthulhu, and generic sheets).
 *
 * Groups, not raw hits, are what get counted: the prompt's own criterion is
 * "a character sheet typically has multiple of these indicators present", and a
 * rulebook page repeating "hit points" forty times is still one concept.
 */
const INDICATOR_GROUPS: Array<{ group: string; patterns: RegExp }> = [
	{
		group: "identity",
		patterns: /\b(?:character name|player name|character sheet|investigator)\b/,
	},
	{
		group: "advancement",
		patterns: /\b(?:level|xp|experience points?|rank|tier|milestones?)\b/,
	},
	{
		group: "role",
		patterns: /\b(?:class|profession|archetype|occupation|career|calling)\b/,
	},
	{
		group: "ancestry",
		patterns: /\b(?:race|species|ancestry|heritage|lineage)\b/,
	},
	{
		group: "vitality",
		patterns: /\b(?:hit points?|hp|health|wounds?|vitality|stamina|sanity)\b/,
	},
	{
		group: "defense",
		patterns: /\b(?:armou?r class|ac|defen[cs]e|dodge|soak|toughness)\b/,
	},
	{
		group: "attributes",
		patterns:
			/\b(?:strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha|power|appearance|education|willpower|agility)\b/,
	},
	{
		group: "skills",
		patterns:
			/\b(?:skills?|proficienc(?:y|ies)|saving throws?|saves|specialit(?:y|ies)|talents?)\b/,
	},
	{
		group: "equipment",
		patterns:
			/\b(?:equipment|inventory|gear|possessions|weapons?|armou?r|carried items?)\b/,
	},
	{
		group: "traits",
		patterns:
			/\b(?:personality traits?|ideals?|bonds?|flaws?|backstory|background|alignment)\b/,
	},
	{
		group: "magic",
		patterns: /\b(?:spells?|cantrips?|spell slots?|spellcasting|rituals?)\b/,
	},
];

export const INDICATOR_GROUP_COUNT = INDICATOR_GROUPS.length;

/**
 * Character sheets are short documents. Past this, a high indicator count means
 * a rulebook — a source that discusses every one of these concepts without
 * being a sheet for any one character.
 */
const RULEBOOK_LENGTH_CHARS = 60_000;

/** Below this word count, an absence of vocabulary proves nothing. */
const MIN_WORDS_FOR_ABSENCE_RULE = 150;

/** Below this connective-word density the text is not English, so see above. */
const MIN_ENGLISH_DENSITY = 0.15;

export interface CharacterSheetIndicatorScore {
	/** Names of the indicator groups that matched. */
	matchedGroups: string[];
	groupsMatched: number;
	wordCount: number;
	/** Connective-word density; the "is this English" check. */
	englishDensity: number;
	length: number;
}

/** Measure a document against the indicator vocabulary. Pure and allocation-light. */
export function scoreCharacterSheetIndicators(
	text: string
): CharacterSheetIndicatorScore {
	const lower = text.toLowerCase();
	const matchedGroups: string[] = [];
	for (const { group, patterns } of INDICATOR_GROUPS) {
		if (patterns.test(lower)) {
			matchedGroups.push(group);
		}
	}
	const words = tokenizeWords(text);
	return {
		matchedGroups,
		groupsMatched: matchedGroups.length,
		wordCount: words.length,
		englishDensity: commonWordRatio(words),
		length: text.length,
	};
}

/**
 * Rules confident enough to skip the detection call today.
 *
 * Deliberately just two, both about text that cannot be a character sheet under
 * any reading. Everything with a plausible failure mode stays advisory until
 * the logs say otherwise.
 */
export function classifyCharacterSheetDecisively(
	text: string
): CharacterSheetRuleMatch | null {
	if (text.trim().length === 0) {
		return {
			verdict: "not-character-sheet",
			rule: "empty-or-whitespace",
			reason: "Document is empty or whitespace only",
			groupsMatched: 0,
		};
	}

	const score = scoreCharacterSheetIndicators(text);

	// Substantial English prose containing not one of eleven concept groups —
	// no name label, no stat, no class, no health, no gear, no skills, no
	// spells. There is no game system whose character sheet reads like that.
	if (
		score.groupsMatched === 0 &&
		score.wordCount >= MIN_WORDS_FOR_ABSENCE_RULE &&
		score.englishDensity >= MIN_ENGLISH_DENSITY
	) {
		return {
			verdict: "not-character-sheet",
			rule: "no-indicators-in-english-prose",
			reason:
				"Substantial English text matching none of the character-sheet indicator groups",
			groupsMatched: 0,
		};
	}

	return null;
}

/**
 * The full rule set, including rules not yet trusted to short-circuit.
 *
 * Evaluated on every detection and logged against the model's answer. A rule
 * whose agreement rate holds up is a candidate for promotion into
 * {@link classifyCharacterSheetDecisively}.
 */
export function classifyCharacterSheetAdvisory(
	text: string
): CharacterSheetRuleMatch {
	const decisive = classifyCharacterSheetDecisively(text);
	if (decisive) {
		return decisive;
	}

	const score = scoreCharacterSheetIndicators(text);

	// A long document that touches every concept is a rulebook, not a sheet.
	// This is the rule most worth measuring: if it holds, it removes the
	// detection call from the dominant upload — a sourcebook PDF.
	if (score.length >= RULEBOOK_LENGTH_CHARS) {
		return {
			verdict: "not-character-sheet",
			rule: "rulebook-length",
			reason:
				"Document is far longer than any character sheet, so indicator matches read as reference material",
			groupsMatched: score.groupsMatched,
		};
	}

	if (score.groupsMatched >= 6) {
		return {
			verdict: "character-sheet",
			rule: "dense-indicator-coverage",
			reason: "Short document covering most character-sheet concept groups",
			groupsMatched: score.groupsMatched,
		};
	}

	if (score.groupsMatched <= 2) {
		return {
			verdict: "not-character-sheet",
			rule: "sparse-indicator-coverage",
			reason: "Almost none of the character-sheet concept groups are present",
			groupsMatched: score.groupsMatched,
		};
	}

	return {
		verdict: "ambiguous",
		rule: "none",
		reason: "Indicator coverage falls between the confident bands",
		groupsMatched: score.groupsMatched,
	};
}
