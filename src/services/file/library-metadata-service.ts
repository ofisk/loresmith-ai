import { chunkTextByCharacterCount } from "@/lib/file/text-chunking-utils";
import { createLogger } from "@/lib/logger";
import { getSemanticMetadataPrompt } from "@/lib/prompts/file-indexing-prompts";
import type { Env } from "@/middleware/auth";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Token budget constants.
//
// @cf/meta/llama-3.1-8b-instruct has a 7,968-token context window, and that
// window covers prompt *and* completion together — `max_tokens` reserves space
// inside it rather than granting a separate allowance. It must therefore stay
// comfortably below the window or Workers AI rejects the request outright.
// This service used to ask for 16,384 output tokens, more than twice the whole
// window, so every call was rejected and metadata generation silently fell back
// to the filename.
export const MODEL_CONTEXT_WINDOW_TOKENS = 7968;
const CHARS_PER_TOKEN = 4;

// The JSON we ask for (display name, one-or-two-sentence description, a handful
// of tags) is ~100 tokens. 512 leaves room for a chatty model without crowding
// the prompt out of the context window.
export const MAX_RESPONSE_TOKENS = 512;

// Room reserved for the fixed instruction text in getSemanticMetadataPrompt().
const PROMPT_OVERHEAD_TOKENS = 400;

// Smallest excerpt worth sending. Also a safety floor: the excerpt budget is
// derived by subtraction, so an over-large MAX_RESPONSE_TOKENS would otherwise
// make it zero or negative — and chunkTextByCharacterCount() never advances its
// cursor for a non-positive chunk size, hanging the request in an infinite loop.
const MIN_EXCERPT_CHARS = 1000;

// Whatever is left of the window after the completion reservation and the
// instruction overhead is what document excerpts may occupy.
const MAX_EXCERPT_TOKENS =
	MODEL_CONTEXT_WINDOW_TOKENS - MAX_RESPONSE_TOKENS - PROMPT_OVERHEAD_TOKENS;
export const MAX_EXCERPT_CHARS = Math.max(
	MIN_EXCERPT_CHARS,
	MAX_EXCERPT_TOKENS * CHARS_PER_TOKEN
); // ~28k chars

// Only the first 1,000 characters of each chunk were ever sent to the model, so
// splitting a whole book into 42k-char chunks produced dozens of concurrent
// calls that each looked at 1,000 characters. Sample a bounded number of
// excerpts spread across the document instead: enough to characterise a long
// PDF, few enough to stay clear of Workers AI concurrency limits.
export const MAX_SAMPLED_EXCERPTS = 3;
const EXCERPT_CHARS = Math.max(
	MIN_EXCERPT_CHARS,
	Math.floor(MAX_EXCERPT_CHARS / MAX_SAMPLED_EXCERPTS)
); // ~9.4k chars

const MAX_DESCRIPTION_CHARS = 500;

export interface SemanticMetadataResult {
	displayName: string;
	description: string;
	tags: string[];
}

/**
 * Select up to MAX_SAMPLED_EXCERPTS excerpts spread evenly across the document.
 *
 * Exported for tests: this decides how much of a large file the model ever
 * sees, and how many concurrent inference calls a single upload triggers.
 */
export function selectExcerpts(content: string): string[] {
	if (content.length === 0) {
		return [""];
	}

	if (content.length <= EXCERPT_CHARS) {
		return [content];
	}

	const chunks = chunkTextByCharacterCount(content, EXCERPT_CHARS);
	if (chunks.length <= MAX_SAMPLED_EXCERPTS) {
		return chunks;
	}

	// Spread the samples across the document (beginning, middle, end) rather
	// than taking the first N, so a table of contents does not stand in for the
	// whole book.
	const stride = (chunks.length - 1) / (MAX_SAMPLED_EXCERPTS - 1);
	const sampled: string[] = [];
	for (let i = 0; i < MAX_SAMPLED_EXCERPTS; i++) {
		sampled.push(chunks[Math.round(i * stride)]);
	}
	return sampled;
}

/**
 * Service for generating semantic metadata for library files
 */
export class LibraryMetadataService {
	private log: ReturnType<typeof createLogger>;

	constructor(private env: Env) {
		this.log = createLogger(
			env as unknown as Record<string, unknown>,
			"[LibraryMetadataService]"
		);
	}

	/**
	 * Generate semantic metadata from file content.
	 *
	 * Returns undefined when the model produced nothing usable. Callers treat a
	 * defined result as "the LLM described this file", so this must never invent
	 * a display name purely from the filename — that output is indistinguishable
	 * from a successful generation, and is exactly what hid this feature's
	 * failure for months.
	 */
	async generateSemanticMetadata(
		fileName: string,
		fileKey: string,
		username: string,
		fileContent: string
	): Promise<SemanticMetadataResult | undefined> {
		try {
			if (!this.env.AI) {
				this.log.warn("AI binding unavailable; skipping metadata generation", {
					fileKey,
				});
				return undefined;
			}

			const content = fileContent?.trim() ? fileContent : "";
			const excerpts = selectExcerpts(content);
			const hasContent = content.length > 0;

			const allTags: Set<string> = new Set();
			const allDescriptions: string[] = [];
			const allDisplayNames: string[] = [];

			const settled = await Promise.allSettled(
				excerpts.map((excerpt, index) => {
					const semanticPrompt = getSemanticMetadataPrompt(
						fileName,
						fileKey,
						username,
						hasContent,
						excerpt,
						excerpts.length,
						index
					);
					return this.env.AI!.run(LLM_MODEL, {
						messages: [{ role: "user", content: semanticPrompt }],
						max_tokens: MAX_RESPONSE_TOKENS,
					});
				})
			);

			let rejectedCount = 0;
			let unparseableCount = 0;

			for (let i = 0; i < settled.length; i++) {
				const result = settled[i];
				if (result.status === "rejected") {
					rejectedCount++;
					this.log.error(
						"Workers AI call failed during metadata generation",
						result.reason,
						{ fileKey, excerpt: i + 1, totalExcerpts: settled.length }
					);
					continue;
				}

				const responseText = this.extractResponseText(result.value);
				const jsonMatch = responseText?.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					unparseableCount++;
					this.log.warn("Model response contained no JSON object", {
						fileKey,
						excerpt: i + 1,
					});
					continue;
				}

				try {
					const parsed = JSON.parse(jsonMatch[0]);
					if (parsed.displayName) allDisplayNames.push(parsed.displayName);
					if (parsed.description) allDescriptions.push(parsed.description);
					if (Array.isArray(parsed.tags)) {
						for (const tag of parsed.tags) {
							allTags.add(tag);
						}
					}
				} catch (parseError) {
					unparseableCount++;
					this.log.warn("Failed to parse JSON from model response", {
						fileKey,
						excerpt: i + 1,
						error:
							parseError instanceof Error
								? parseError.message
								: String(parseError),
					});
				}
			}

			// Nothing usable came back. Report it as a failure rather than
			// laundering it into a filename-derived "suggestion".
			if (
				allDisplayNames.length === 0 &&
				allDescriptions.length === 0 &&
				allTags.size === 0
			) {
				this.log.error("Metadata generation produced no usable output", {
					fileKey,
					fileName,
					excerpts: settled.length,
					rejectedCount,
					unparseableCount,
				});
				return undefined;
			}

			const result: SemanticMetadataResult = {
				displayName:
					allDisplayNames.length > 0
						? allDisplayNames[0]
						: fileName.replace(/\.[^/.]+$/, ""),
				description: allDescriptions
					.join(" ")
					.substring(0, MAX_DESCRIPTION_CHARS),
				tags: Array.from(allTags),
			};

			this.log.info("Generated semantic metadata", {
				fileKey,
				displayName: result.displayName,
				descriptionLength: result.description.length,
				tagCount: result.tags.length,
				rejectedCount,
				unparseableCount,
			});

			return result;
		} catch (error) {
			this.log.error("Unexpected error generating semantic metadata", error, {
				fileKey,
				fileName,
			});
			return undefined;
		}
	}

	/**
	 * Extract text from AI response, handling different response types
	 */
	private extractResponseText(response: any): string {
		if (typeof response === "string") {
			return response;
		} else if (
			response &&
			typeof response === "object" &&
			"response" in response
		) {
			return (response as any).response;
		} else if (
			response &&
			typeof response === "object" &&
			"content" in response
		) {
			return Array.isArray((response as any).content)
				? (response as any).content.map((c: any) => c.text || c).join("\n")
				: JSON.stringify(response);
		} else {
			return JSON.stringify(response);
		}
	}
}
