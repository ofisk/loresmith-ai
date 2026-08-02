/**
 * Keeps implementation detail out of anything the chat model can see.
 *
 * Telling the agent "never mention Cloudflare" is not enough on its own: tool
 * failures hand it strings like "OpenAI API key not configured" and then ask it
 * not to repeat them. This redacts that vocabulary before the tool result is
 * returned, so the model has nothing to leak. The raw text is logged instead,
 * where developers can still read it.
 *
 * Only messages that actually contain infrastructure vocabulary are replaced.
 * Ordinary failures ("Campaign not found") pass through untouched, because the
 * user and the model both need those.
 */

/** Shown when a capability is missing or switched off. */
export const UNAVAILABLE_MESSAGE = "That's not something I can do right now.";

/** Shown when something broke unexpectedly. */
export const GENERIC_FAILURE_MESSAGE =
	"Something went wrong on my end, so I couldn't finish that. Please try again in a moment.";

/**
 * Vocabulary that reveals how LoreSmith is built.
 *
 * Patterns are deliberately narrow. Bare "environment", "worker", "binding" and
 * "model" are all legitimate tabletop words, so each is matched only in a phrase
 * that can only be infrastructure.
 */
const IMPLEMENTATION_DETAIL_PATTERNS: RegExp[] = [
	// Platform and vendors
	/\bcloudflare\b/i,
	/\bworkers?\s+ai\b/i,
	/\bautorag\b/i,
	/\bvectorize\b/i,
	/\bwrangler\b/i,
	/\bdurable objects?\b/i,
	/\bR2\b/,
	/\bD1\b/,
	/\bKV (namespace|store)\b/i,
	/\bopenai\b/i,
	/\banthropic\b/i,
	/\bgpt-?\d/i,
	/\bclaude\b/i,
	/\bllama\b/i,
	// Credentials and configuration
	/\bapi[_\s-]?keys?\b/i,
	/\baccess tokens?\b/i,
	/\benvironment variables?\b/i,
	/\benv(ironment)? vars?\b/i,
	/\bnot configured\b/i,
	/\bmisconfigured\b/i,
	/\bthis environment\b/i,
	/\benvironment (is |was )?(not available|unavailable)\b/i,
	// Storage and retrieval internals
	/\bvector (index|store|database|db|search)\b/i,
	/\bembeddings?\b/i,
	/\bdirect database access\b/i,
	/\bdatabase (is |was )?(not available|unavailable)\b/i,
	/\b(the |a )?database connection\b/i,
	/\bqueue consumer\b/i,
	// Model plumbing. "provider" is matched only where it is qualified by a
	// service word, or where it is talked about as something you switch on --
	// never in the bare sense ("the provider of the quest").
	/\bai model\b/i,
	/\bbuilt-in ai\b/i,
	/\bmodel (path|name|id|version)\b/i,
	/\b(ai|model|llm|audio|voice|speech|image|video|search|storage|email|auth|payment|external|third[-\s]party|service|api)\s+providers?\b/i,
	/\bproviders?\s+(is |are |was |were )?(not )?(configured|enabled|available|set up|hooked up)\b/i,
	/\bhooked up\b/i,
	/\bllm\b/i,
	// Raw diagnostics
	/\bstack trace\b/i,
	// Deliberately NOT redacted: bare HTTP status codes. They reveal nothing
	// about how LoreSmith is built, and the model needs "not found" vs "broke"
	// to answer sensibly. The prompt rule keeps codes out of what the user reads.
];

/** Phrasing that means "this capability is off or absent" rather than "it broke". */
const UNAVAILABILITY_PATTERNS: RegExp[] = [
	// Only consulted for text already flagged as implementation detail, so these
	// can be broader than the patterns above.
	/\bconfigured\b/i,
	/\bmisconfigured\b/i,
	/\bhooked up\b/i,
	/\bdoesn'?t (have|offer|support)\b/i,
	/\bnot (available|enabled|supported|set up)\b/i,
	/\bunavailable\b/i,
	/\bunsupported\b/i,
	/\bis disabled\b/i,
	/\bmissing\b/i,
	/\brequires\b/i,
];

/** True when `text` names any part of how LoreSmith is built. */
export function containsImplementationDetail(
	text: string | null | undefined
): boolean {
	if (!text) return false;
	return IMPLEMENTATION_DETAIL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Returns `text` unchanged unless it exposes implementation detail, in which
 * case it becomes a plain-language stand-in.
 *
 * Redaction replaces the whole message rather than swapping words, because
 * word-level substitution produces sentences that are still recognisably
 * technical ("the audio thing isn't configured").
 */
export function sanitizeUserFacingText(
	text: string | null | undefined
): string {
	if (!text) return GENERIC_FAILURE_MESSAGE;
	if (!containsImplementationDetail(text)) return text;

	const isUnavailability = UNAVAILABILITY_PATTERNS.some((pattern) =>
		pattern.test(text)
	);
	return isUnavailability ? UNAVAILABLE_MESSAGE : GENERIC_FAILURE_MESSAGE;
}
