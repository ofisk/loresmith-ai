import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	LibraryMetadataService,
	MAX_EXCERPT_CHARS,
	MAX_RESPONSE_TOKENS,
	MAX_SAMPLED_EXCERPTS,
	MODEL_CONTEXT_WINDOW_TOKENS,
	selectExcerpts,
} from "@/services/file/library-metadata-service";

const mockAI = {
	run: vi.fn(),
};

const mockEnv = {
	AI: mockAI,
} as any;

const validResponse = (overrides: Record<string, unknown> = {}) => ({
	response: JSON.stringify({
		displayName: "Test Document",
		description: "A test document",
		tags: ["test", "document"],
		...overrides,
	}),
});

describe("LibraryMetadataService", () => {
	let service: LibraryMetadataService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new LibraryMetadataService(mockEnv);
	});

	// The regression that silently disabled library auto-naming: the service
	// asked a model with a 7,968-token context window for 16,384 output tokens.
	// Workers AI rejects that, every call failed, and the old filename fallback
	// made the failure look like success. These assertions fail loudly if the
	// request ever drifts back out of the model's budget.
	describe("token budget", () => {
		it("requests fewer output tokens than the model's context window", async () => {
			mockAI.run.mockResolvedValue(validResponse());

			await service.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"Short content"
			);

			expect(mockAI.run).toHaveBeenCalled();
			const [, options] = mockAI.run.mock.calls[0];
			expect(options.max_tokens).toBe(MAX_RESPONSE_TOKENS);
			expect(options.max_tokens).toBeLessThan(MODEL_CONTEXT_WINDOW_TOKENS);
		});

		it("keeps prompt plus reserved completion inside the context window", async () => {
			mockAI.run.mockResolvedValue(validResponse());

			// Content large enough to fill every sampled excerpt to capacity.
			await service.generateSemanticMetadata(
				"huge.pdf",
				"uploads/huge.pdf",
				"user-123",
				"x".repeat(MAX_EXCERPT_CHARS * 10)
			);

			for (const [, options] of mockAI.run.mock.calls) {
				const promptChars = options.messages[0].content.length;
				const estimatedPromptTokens = Math.ceil(promptChars / 4);
				expect(estimatedPromptTokens + options.max_tokens).toBeLessThan(
					MODEL_CONTEXT_WINDOW_TOKENS
				);
			}
		});

		// The excerpt budget is derived by subtracting the completion reservation
		// from the context window. If it ever goes non-positive,
		// chunkTextByCharacterCount() spins forever and hangs the Worker request.
		it("keeps the derived excerpt budget positive", () => {
			expect(MAX_EXCERPT_CHARS).toBeGreaterThan(0);
			expect(selectExcerpts("x".repeat(600_000)).length).toBeGreaterThan(0);
		});

		it("bounds concurrent inference calls regardless of document size", async () => {
			mockAI.run.mockResolvedValue(validResponse());

			// A 600k-char PDF previously fanned out to ~15 concurrent calls.
			await service.generateSemanticMetadata(
				"book.pdf",
				"uploads/book.pdf",
				"user-123",
				"x".repeat(600_000)
			);

			expect(mockAI.run.mock.calls.length).toBeLessThanOrEqual(
				MAX_SAMPLED_EXCERPTS
			);
		});
	});

	describe("generateSemanticMetadata", () => {
		it("returns the display name and description the model produced", async () => {
			mockAI.run.mockResolvedValue(validResponse());

			const result = await service.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"Short content"
			);

			expect(mockAI.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				displayName: "Test Document",
				description: "A test document",
				tags: ["test", "document"],
			});
		});

		it("merges results across sampled excerpts", async () => {
			const largeContent = "x".repeat(600_000);
			mockAI.run
				.mockResolvedValueOnce({
					response: JSON.stringify({
						displayName: "Excerpt 1 Name",
						description: "First excerpt description",
						tags: ["first"],
					}),
				})
				.mockResolvedValue({
					response: JSON.stringify({
						displayName: "Excerpt 2 Name",
						description: "Second excerpt description",
						tags: ["second"],
					}),
				});

			const result = await service.generateSemanticMetadata(
				"large.pdf",
				"uploads/large.pdf",
				"user-123",
				largeContent
			);

			expect(result?.displayName).toBe("Excerpt 1 Name");
			expect(result?.description).toContain("First excerpt");
			expect(result?.description).toContain("Second excerpt");
			expect(result?.tags).toContain("first");
			expect(result?.tags).toContain("second");
		});

		it("continues when some excerpt calls fail", async () => {
			const largeContent = "x".repeat(600_000);
			mockAI.run
				.mockRejectedValueOnce(new Error("AI error"))
				.mockResolvedValue({
					response: JSON.stringify({
						displayName: "Surviving Excerpt",
						description: "From successful excerpt",
						tags: ["ok"],
					}),
				});

			const result = await service.generateSemanticMetadata(
				"large.pdf",
				"uploads/large.pdf",
				"user-123",
				largeContent
			);

			expect(result?.displayName).toBe("Surviving Excerpt");
			expect(result?.tags).toContain("ok");
		});

		// The core of the regression: a total inference failure must be
		// reportable. If it returns a filename-derived name instead, callers
		// write that to display_name and the outage is invisible.
		it("returns undefined when every inference call fails", async () => {
			mockAI.run.mockRejectedValue(
				new Error("max_tokens exceeds the model context window")
			);

			const result = await service.generateSemanticMetadata(
				"my-document.pdf",
				"uploads/my-document.pdf",
				"user-123",
				"Some extracted content"
			);

			expect(result).toBeUndefined();
		});

		it("does not fabricate a display name from the filename", async () => {
			mockAI.run.mockRejectedValue(new Error("AI unavailable"));

			const result = await service.generateSemanticMetadata(
				"my-document.pdf",
				"uploads/my-document.pdf",
				"user-123",
				"Some extracted content"
			);

			expect(result?.displayName).not.toBe("my-document");
			expect(result).toBeUndefined();
		});

		it("returns undefined when responses contain no JSON", async () => {
			mockAI.run.mockResolvedValue({
				response: "I'm sorry, I cannot help with that request.",
			});

			const result = await service.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"content"
			);

			expect(result).toBeUndefined();
		});

		it("returns undefined when the JSON payload is malformed", async () => {
			mockAI.run.mockResolvedValue({
				response: '{"displayName": "Broken", "description":}',
			});

			const result = await service.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"content"
			);

			expect(result).toBeUndefined();
		});

		it("returns undefined when AI binding is not available", async () => {
			const serviceWithoutAI = new LibraryMetadataService({
				AI: undefined,
			} as any);

			const result = await serviceWithoutAI.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"content"
			);

			expect(result).toBeUndefined();
			expect(mockAI.run).not.toHaveBeenCalled();
		});

		it("still asks the model for a name when no content was extracted", async () => {
			mockAI.run.mockResolvedValue(validResponse({ displayName: "From AI" }));

			const result = await service.generateSemanticMetadata(
				"my-document.pdf",
				"uploads/my-document.pdf",
				"user-123",
				""
			);

			expect(mockAI.run).toHaveBeenCalledTimes(1);
			expect(result?.displayName).toBe("From AI");
		});

		it("truncates long descriptions to 500 characters", async () => {
			mockAI.run.mockResolvedValue(
				validResponse({ description: "y".repeat(900) })
			);

			const result = await service.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"content"
			);

			expect(result?.description).toHaveLength(500);
		});
	});

	describe("selectExcerpts", () => {
		it("returns a single empty excerpt for empty content", () => {
			expect(selectExcerpts("")).toEqual([""]);
		});

		it("returns the whole document when it fits in one excerpt", () => {
			const content = "short document";
			expect(selectExcerpts(content)).toEqual([content]);
		});

		it("samples at most MAX_SAMPLED_EXCERPTS from a long document", () => {
			const excerpts = selectExcerpts("x".repeat(600_000));
			expect(excerpts.length).toBeLessThanOrEqual(MAX_SAMPLED_EXCERPTS);
		});

		it("samples from across the document, not just the beginning", () => {
			// Distinct markers spread through the text so we can tell which
			// regions were sampled.
			const segment = (marker: string) => marker.repeat(20_000);
			const content =
				segment("A") +
				segment("B") +
				segment("C") +
				segment("D") +
				segment("E");

			const excerpts = selectExcerpts(content);
			const joined = excerpts.join("");

			expect(joined).toContain("A");
			expect(joined).toContain("E");
		});
	});
});
