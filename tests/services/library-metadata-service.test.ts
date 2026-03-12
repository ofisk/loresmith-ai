import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryMetadataService } from "@/services/file/library-metadata-service";

const mockAI = {
	run: vi.fn(),
};

const mockEnv = {
	AI: mockAI,
} as any;

describe("LibraryMetadataService", () => {
	let service: LibraryMetadataService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new LibraryMetadataService(mockEnv);
	});

	describe("generateSemanticMetadata", () => {
		it("should call AI.run in parallel for all chunks", async () => {
			mockAI.run.mockResolvedValue({
				response: JSON.stringify({
					displayName: "Test Document",
					description: "A test document",
					tags: ["test", "document"],
				}),
			});

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

		it("should process multiple chunks in parallel", async () => {
			// Content larger than MAX_CHUNK_SIZE (~42k chars) triggers chunking
			const largeContent = "x".repeat(50000);
			mockAI.run
				.mockResolvedValueOnce({
					response: JSON.stringify({
						displayName: "Chunk 1 Name",
						description: "First chunk description",
						tags: ["chunk1"],
					}),
				})
				.mockResolvedValueOnce({
					response: JSON.stringify({
						displayName: "Chunk 2 Name",
						description: "Second chunk description",
						tags: ["chunk2"],
					}),
				});

			const result = await service.generateSemanticMetadata(
				"large.pdf",
				"uploads/large.pdf",
				"user-123",
				largeContent
			);

			// Should have 2 chunks
			expect(mockAI.run).toHaveBeenCalledTimes(2);
			// Merge: displayName from first, descriptions joined, tags combined
			expect(result?.displayName).toBe("Chunk 1 Name");
			expect(result?.description).toContain("First chunk");
			expect(result?.description).toContain("Second chunk");
			expect(result?.tags).toContain("chunk1");
			expect(result?.tags).toContain("chunk2");
		});

		it("should continue when some chunk calls fail", async () => {
			const largeContent = "x".repeat(50000);
			mockAI.run
				.mockRejectedValueOnce(new Error("AI error"))
				.mockResolvedValueOnce({
					response: JSON.stringify({
						displayName: "Surviving Chunk",
						description: "From successful chunk",
						tags: ["ok"],
					}),
				});

			const result = await service.generateSemanticMetadata(
				"large.pdf",
				"uploads/large.pdf",
				"user-123",
				largeContent
			);

			expect(result).toEqual({
				displayName: "Surviving Chunk",
				description: "From successful chunk",
				tags: ["ok"],
			});
		});

		it("should return undefined when AI binding is not available", async () => {
			const envWithoutAI = { AI: undefined } as any;
			const serviceWithoutAI = new LibraryMetadataService(envWithoutAI);

			const result = await serviceWithoutAI.generateSemanticMetadata(
				"test.pdf",
				"uploads/test.pdf",
				"user-123",
				"content"
			);

			expect(result).toBeUndefined();
			expect(mockAI.run).not.toHaveBeenCalled();
		});

		it("should use filename as display name when no content", async () => {
			mockAI.run.mockResolvedValue({
				response: JSON.stringify({
					displayName: "From AI",
					description: "Filename analysis",
					tags: ["empty"],
				}),
			});

			const result = await service.generateSemanticMetadata(
				"my-document.pdf",
				"uploads/my-document.pdf",
				"user-123",
				""
			);

			expect(result?.displayName).toBe("From AI");
		});
	});
});
