/**
 * Heuristics for when to inject on-demand system rules so the model uses
 * {@link getMessageHistory}. Kept in one module for tests and stable tuning.
 */

/** Phrases like "that one", "the first one" (short-window follow-ups). */
export const AMBIGUOUS_REFERENCE_PATTERN =
	/\b(the next one|that one|these|those|the first one|move to the next)\b/i;

/**
 * User explicitly wants persisted chat scanned (time range, search, scroll,
 * extract from history). Broad enough for "last 3 days of chat" style asks.
 */
export const HISTORY_RESEARCH_PATTERN = new RegExp(
	[
		String.raw`\bchat history\b`,
		String.raw`\bmessage history\b`,
		String.raw`\bconversation history\b`,
		String.raw`\b(?:last|past)\s+\d+\s+(?:day|days|week|weeks|month|months)\b`,
		String.raw`\bsearch\s+back\s+through\b`,
		String.raw`\bsearch\s+through\b`,
		String.raw`\bgo\s+back\s+through\b`,
		String.raw`\bscroll(?:ing)?(?:\s+back)?\s+through\b`,
		String.raw`\bextract\b[\s\S]{0,220}\b(?:chat|conversation|conversations|messages|history)\b`,
		String.raw`\b(?:find|recall|scan)\b[\s\S]{0,160}\b(?:chat|conversation|messages)\b`,
		String.raw`\bwhat\s+did\s+we\s+(?:say|discuss|talk)\b`,
		String.raw`\bearlier\s+(?:messages|in\s+the\s+chat|in\s+this\s+conversation)\b`,
	].join("|"),
	"i"
);

export function messageHistoryInjectionFlags(userContent: string): {
	ambiguousReference: boolean;
	historyResearch: boolean;
} {
	const trimmed = userContent.trim();
	return {
		ambiguousReference: AMBIGUOUS_REFERENCE_PATTERN.test(trimmed),
		historyResearch: HISTORY_RESEARCH_PATTERN.test(trimmed),
	};
}
