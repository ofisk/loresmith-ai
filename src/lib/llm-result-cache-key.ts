/**
 * Cache keys for the content-addressed LLM result cache (issue #761, finding 8).
 *
 * Pure and dependency-free so the key derivation can be tested without a D1
 * binding, and so the queue-driven batch path can derive the same key as the
 * inline path without importing the whole service.
 *
 * The issue asks for a key over `(model, prompt-version, chunk-content)`. This
 * hashes the **rendered prompt prefix** in place of a `prompt-version` constant:
 * a hand-maintained version number is a step someone eventually forgets to
 * bump, and a stale cache that silently serves results from a superseded prompt
 * is worse than no cache. Deriving the version from the prompt text itself
 * makes an instruction edit and a content edit invalidate by the same
 * mechanism, with nothing left to remember.
 */

/** Which pipeline a cached payload came from. Also the hit-rate grouping key. */
export type LlmResultCacheKind =
	| "entity_extraction"
	| "character_sheet_detection"
	| "character_sheet_parse";

/**
 * Bumped by hand only when the *interpretation* of a stored payload changes in
 * a way the prompt text does not capture — a new post-processing step, a
 * different validation schema applied to the same model output. Prompt edits do
 * not need it; they change `promptDigest` on their own.
 */
export const LLM_RESULT_CACHE_NAMESPACE = "v1";

const encoder = new TextEncoder();

/** SHA-256 as lowercase hex. `crypto.subtle` is available in Workers and Node 18+. */
export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export interface LlmResultCacheKeyInput {
	kind: LlmResultCacheKind;
	/** Resolved model id, so a tier change does not serve the old model's output. */
	model: string;
	/**
	 * The stable instruction block — everything that is identical across calls of
	 * this kind. Editing it must invalidate every entry, which is what hashing it
	 * into the key achieves.
	 */
	promptPrefix: string;
	/** The per-call part: chunk text, document text, a name hint. */
	variablePart: string;
}

export interface LlmResultCacheKeyParts {
	/** Primary key of the cache row. */
	cacheKey: string;
	/** Digest of `promptPrefix` alone, so a superseded prompt's rows can be swept. */
	promptDigest: string;
}

/**
 * Derive the cache key and the prompt digest.
 *
 * Components are hashed to fixed-length hex before being joined, so no choice of
 * prompt or content can produce the same joined string as a different choice —
 * a plain `${a}|${b}` join over variable-length text cannot promise that.
 */
export async function buildLlmResultCacheKey(
	input: LlmResultCacheKeyInput
): Promise<LlmResultCacheKeyParts> {
	const [promptDigest, contentDigest] = await Promise.all([
		sha256Hex(input.promptPrefix),
		sha256Hex(input.variablePart),
	]);
	const cacheKey = await sha256Hex(
		[
			LLM_RESULT_CACHE_NAMESPACE,
			input.kind,
			input.model,
			promptDigest,
			contentDigest,
		].join("\n")
	);
	return { cacheKey, promptDigest };
}
