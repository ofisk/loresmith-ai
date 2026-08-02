/**
 * Deterministic pre-gate for extraction chunks.
 *
 * The LLM gate (`extraction-chunk-gate.ts`) sends up to 8,000 characters —
 * roughly 2,000 input tokens — to a model to return a single boolean. Its skip
 * criteria are all shape, not meaning: whitespace, page-number runs, copyright
 * boilerplate, navigation text, repeated filler. Every one of those is a
 * character-class ratio or a phrase list.
 *
 * Following the discipline #759 established for agent routing, this module ships
 * in two halves:
 *
 * - `classifyChunkDecisively` — rules confident enough to skip the model call.
 *   Currently only the ones that cannot be wrong (empty / whitespace-only), so
 *   turning the gate on changes no extraction outcome.
 * - `classifyChunkAdvisory` — the full rule set, evaluated but never acted on.
 *   Its agreement rate with the LLM gate is logged, and that measurement is what
 *   decides which rules get promoted to decisive.
 *
 * The conservative default is preserved throughout: when a rule is unsure, the
 * verdict is `ambiguous` and full extraction runs.
 */

import { commonWordRatio, tokenizeWords } from "@/lib/english-prose-stats";

export type ChunkGateVerdict =
	/** Confidently not worth extracting — skip. */
	| "non-substantive"
	/** Confidently worth extracting — run full extraction, no gate call needed. */
	| "substantive"
	/** Genuinely unclear — defer to the LLM gate. */
	| "ambiguous";

export interface ChunkGateRuleMatch {
	verdict: ChunkGateVerdict;
	/** Stable identifier so the log drain can group by rule. */
	rule: string;
	/** Short human-readable justification; safe to log (no chunk content). */
	reason: string;
}

/** Phrases that, when they dominate a chunk, mean it carries no game content. */
const BOILERPLATE_PHRASES = [
	"all rights reserved",
	"printed in the united states",
	"no part of this publication may be reproduced",
	"is a trademark",
	"are trademarks",
	"open game license",
	"product identity",
	"table of contents",
	"this page intentionally left blank",
	"click here",
	"see page",
	"continued on page",
	"back to top",
	"copyright ©",
];

export interface ChunkTextStats {
	length: number;
	/** Share of characters that are whitespace. */
	whitespaceRatio: number;
	/** Share of non-whitespace characters that are digits or separators. */
	digitRatio: number;
	wordCount: number;
	/** Share of words that appear in the shared common-word list. */
	commonWordRatio: number;
	/** Share of lines that end in a bare number (TOC / page-footer shape). */
	pageNumberLineRatio: number;
	/** Share of lines that are duplicates of an earlier line. */
	repeatedLineRatio: number;
	/** Share of characters covered by matched boilerplate phrases. */
	boilerplateRatio: number;
}

/** Measure the shape of a chunk. Pure and cheap — no allocation per character. */
export function computeChunkTextStats(text: string): ChunkTextStats {
	const length = text.length;
	if (length === 0) {
		return {
			length: 0,
			whitespaceRatio: 1,
			digitRatio: 0,
			wordCount: 0,
			commonWordRatio: 0,
			pageNumberLineRatio: 0,
			repeatedLineRatio: 0,
			boilerplateRatio: 0,
		};
	}

	const whitespaceCount = (text.match(/\s/g) ?? []).length;
	const nonWhitespace = length - whitespaceCount;
	const digitCount = (text.match(/[\d.,:;·—–\-|]/g) ?? []).length;

	const words = tokenizeWords(text);

	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const pageNumberLines = lines.filter((l) =>
		/(?:^\d+$)|(?:[.\s]{2,}\d{1,4}$)/.test(l)
	).length;

	const seen = new Set<string>();
	let repeatedLines = 0;
	for (const line of lines) {
		if (seen.has(line)) repeatedLines++;
		else seen.add(line);
	}

	const lower = text.toLowerCase();
	let boilerplateChars = 0;
	for (const phrase of BOILERPLATE_PHRASES) {
		let idx = lower.indexOf(phrase);
		while (idx !== -1) {
			boilerplateChars += phrase.length;
			idx = lower.indexOf(phrase, idx + phrase.length);
		}
	}

	return {
		length,
		whitespaceRatio: whitespaceCount / length,
		digitRatio: nonWhitespace === 0 ? 0 : digitCount / nonWhitespace,
		wordCount: words.length,
		commonWordRatio: commonWordRatio(words),
		pageNumberLineRatio:
			lines.length === 0 ? 0 : pageNumberLines / lines.length,
		repeatedLineRatio: lines.length === 0 ? 0 : repeatedLines / lines.length,
		boilerplateRatio: Math.min(1, boilerplateChars / length),
	};
}

/**
 * Rules confident enough to act on today.
 *
 * Only the ones with no failure mode: there is no reading of "empty string" or
 * "twelve characters of whitespace" under which full extraction would find an
 * entity. Everything else stays advisory until the logs say otherwise.
 */
export function classifyChunkDecisively(
	text: string
): ChunkGateRuleMatch | null {
	if (text.trim().length === 0) {
		return {
			verdict: "non-substantive",
			rule: "empty-or-whitespace",
			reason: "Chunk is empty or whitespace only",
		};
	}
	// Below this, there is not enough text to describe an entity even in principle.
	if (text.trim().length < 24) {
		return {
			verdict: "non-substantive",
			rule: "below-minimum-length",
			reason: "Chunk is shorter than the minimum length an entity needs",
		};
	}
	return null;
}

/**
 * The full rule set, including rules not yet trusted to short-circuit.
 *
 * Evaluated on every gated chunk and logged against the LLM gate's answer. A
 * rule whose agreement rate holds up in the logs is a candidate for promotion
 * into {@link classifyChunkDecisively}.
 */
export function classifyChunkAdvisory(text: string): ChunkGateRuleMatch {
	const decisive = classifyChunkDecisively(text);
	if (decisive) {
		return decisive;
	}

	const stats = computeChunkTextStats(text);

	if (stats.boilerplateRatio >= 0.25 && stats.wordCount < 400) {
		return {
			verdict: "non-substantive",
			rule: "legal-or-navigation-boilerplate",
			reason: "Boilerplate phrases dominate a short chunk",
		};
	}

	if (stats.pageNumberLineRatio >= 0.6 && stats.commonWordRatio < 0.12) {
		return {
			verdict: "non-substantive",
			rule: "table-of-contents-or-page-numbers",
			reason: "Most lines end in a page number and prose density is low",
		};
	}

	if (stats.digitRatio >= 0.4 && stats.commonWordRatio < 0.1) {
		return {
			verdict: "non-substantive",
			rule: "numeric-runs",
			reason: "Digits and separators dominate with almost no connective prose",
		};
	}

	if (stats.repeatedLineRatio >= 0.7 && stats.wordCount < 300) {
		return {
			verdict: "non-substantive",
			rule: "repeated-filler",
			reason: "Most lines are duplicates of earlier lines",
		};
	}

	// Dense, prose-shaped text: extraction is very likely to find something.
	if (stats.wordCount >= 120 && stats.commonWordRatio >= 0.2) {
		return {
			verdict: "substantive",
			rule: "prose-density",
			reason: "Long-form text with typical connective-word density",
		};
	}

	return {
		verdict: "ambiguous",
		rule: "none",
		reason: "No rule matched confidently",
	};
}
