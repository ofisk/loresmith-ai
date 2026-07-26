/**
 * Shared helpers for coaxing and parsing JSON out of a text completion.
 *
 * Used by both the synchronous Anthropic structured path and the Message
 * Batches path (issue #735). They must stay in one place: if the two paths
 * built different prompt prefixes or parsed output differently, a chunk could
 * extract cleanly inline and fail in a batch (or vice versa), and the
 * batch→inline fallback would stop being a true fallback.
 */

/** Prepended to every structured-output prompt. */
export const STRUCTURED_JSON_INTRO =
	"Respond with valid JSON only. Do not wrap the JSON in markdown fences.";

/** Schema instruction block appended after the prompt, or "" when no schema. */
export function structuredSchemaInstructions(
	parsedSchema: Record<string, unknown> | null
): string {
	if (!parsedSchema) {
		return "";
	}
	return `\n\nYou MUST return JSON that conforms to this JSON Schema:\n${JSON.stringify(parsedSchema)}`;
}

/**
 * The full cacheable prefix for a structured request: intro + stable prompt +
 * schema. Identical bytes across requests, so it is the part marked with
 * `cache_control: ephemeral`.
 */
export function buildStructuredCacheablePrefix(
	cacheablePrompt: string,
	parsedSchema: Record<string, unknown> | null = null
): string {
	return `${STRUCTURED_JSON_INTRO}\n\n${cacheablePrompt}${structuredSchemaInstructions(parsedSchema)}`;
}

export function parseStructuredSchema(
	schema?: string
): Record<string, unknown> | null {
	if (!schema?.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(schema) as Record<string, unknown>;
		if (!parsed || typeof parsed !== "object") {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function stripMarkdownCodeFence(text: string): string {
	const trimmed = text.trim();
	const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/** Outermost `{...}` span of a completion, or null when there is none. */
export function extractJsonObjectText(text: string): string | null {
	const stripped = stripMarkdownCodeFence(text);
	const firstBrace = stripped.indexOf("{");
	const lastBrace = stripped.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		return stripped.slice(firstBrace, lastBrace + 1);
	}
	return null;
}
