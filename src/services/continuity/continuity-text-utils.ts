/**
 * Pure text helpers shared by the continuity detectors.
 *
 * Everything here is deterministic and cheap on purpose: the detectors run over
 * the whole corpus before a single model token is spent, so any work done here
 * is work the LLM tiers never have to pay for.
 */

/** Words that are too generic to treat as an entity mention on their own. */
const AMBIGUOUS_SINGLE_WORD_NAMES = new Set([
	"the",
	"party",
	"group",
	"town",
	"city",
	"village",
	"king",
	"queen",
	"guard",
	"guards",
	"inn",
	"tavern",
	"temple",
	"keep",
	"castle",
	"forest",
	"north",
	"south",
	"east",
	"west",
	"council",
	"order",
	"guild",
	"church",
	"crown",
	"empire",
	"kingdom",
]);

/** Single-word names shorter than this are ignored — too collision-prone. */
const MIN_SINGLE_WORD_NAME_LENGTH = 4;

const STOP_WORDS = new Set([
	"a",
	"about",
	"after",
	"all",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"been",
	"before",
	"but",
	"by",
	"can",
	"did",
	"do",
	"for",
	"from",
	"had",
	"has",
	"have",
	"he",
	"her",
	"him",
	"his",
	"how",
	"i",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"of",
	"on",
	"or",
	"our",
	"out",
	"over",
	"she",
	"so",
	"some",
	"that",
	"the",
	"their",
	"them",
	"then",
	"there",
	"these",
	"they",
	"this",
	"to",
	"up",
	"was",
	"we",
	"were",
	"what",
	"when",
	"where",
	"which",
	"who",
	"will",
	"with",
	"you",
	"your",
]);

/** Escape a literal string for safe inclusion in a RegExp. */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Names we are willing to search for in free text. Rejecting weak names up
 * front is the cheapest false-positive control the checker has.
 */
export function isMatchableName(name: string): boolean {
	const trimmed = name.trim();
	if (trimmed.length === 0) return false;

	const words = trimmed.split(/\s+/);
	if (words.length > 1) return true;

	if (trimmed.length < MIN_SINGLE_WORD_NAME_LENGTH) return false;
	return !AMBIGUOUS_SINGLE_WORD_NAMES.has(trimmed.toLowerCase());
}

/**
 * Whole-word, case-insensitive containment check.
 *
 * Uses lookaround rather than `\b` so names ending in punctuation (e.g.
 * "Vane's") and names containing apostrophes still match correctly.
 */
export function mentionsName(text: string, name: string): boolean {
	if (!text || !isMatchableName(name)) return false;
	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?![\\p{L}\\p{N}])`,
		"iu"
	);
	return pattern.test(text);
}

/** First text in `texts` that mentions `name`, or null. */
export function findMention(texts: string[], name: string): string | null {
	for (const text of texts) {
		if (mentionsName(text, name)) return text;
	}
	return null;
}

/** Lowercased content words, used for cheap overlap scoring. */
export function contentTokens(text: string): Set<string> {
	const tokens = text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2 && !STOP_WORDS.has(token));
	return new Set(tokens);
}

/**
 * Jaccard-style overlap between two texts, in [0, 1].
 * Used to decide whether a later digest plausibly resolves an open thread.
 */
export function tokenOverlap(left: string, right: string): number {
	const leftTokens = contentTokens(left);
	const rightTokens = contentTokens(right);
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

	let shared = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) shared += 1;
	}
	return shared / Math.min(leftTokens.size, rightTokens.size);
}

/** Trim an excerpt to a bounded length without cutting mid-word. */
export function toExcerpt(text: string, maxLength = 240): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	const truncated = normalized.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	return `${lastSpace > maxLength / 2 ? truncated.slice(0, lastSpace) : truncated}…`;
}

/**
 * Stable 32-bit FNV-1a hash rendered as hex. Deterministic across runs and
 * platforms, which is what makes fingerprints — and therefore dismissals —
 * survive redeploys.
 */
export function stableHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

/**
 * Build the fingerprint that dedupes a finding across scans.
 *
 * Parts are normalized so cosmetic changes (casing, whitespace) do not create a
 * "new" finding the GM has already dismissed.
 */
export function buildFingerprint(type: string, parts: unknown[]): string {
	const canonical = [type, ...parts]
		.map((part) =>
			String(part ?? "")
				.toLowerCase()
				.replace(/\s+/g, " ")
				.trim()
		)
		.join("|");
	return `${type}:${stableHash(canonical)}`;
}
