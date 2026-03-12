import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryContentSearchService } from "@/services/file/library-content-search-service";

const mockAI = {
	run: vi.fn(),
};

const mockEnv = {
	AI: mockAI,
} as any;

describe("LibraryContentSearchService", () => {
	let service: LibraryContentSearchService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new LibraryContentSearchService(mockEnv);
	});

	describe("searchContent", () => {
		it("should call AI.run in parallel for all content types", async () => {
			mockAI.run.mockResolvedValue({
				response: JSON.stringify({ monsters: [] }),
			});

			await service.searchContent("goblin");

			// CONTENT_TYPES has 30 types - all should be invoked in parallel
			expect(mockAI.run).toHaveBeenCalledTimes(30);
			// All calls should use the same model
			expect(mockAI.run).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					messages: expect.any(Array),
					max_tokens: 2000,
					temperature: 0.1,
				})
			);
		});

		it("should merge results from multiple content types", async () => {
			mockAI.run
				.mockResolvedValueOnce({
					response: JSON.stringify({
						monsters: [
							{
								id: "goblin-1",
								type: "monster",
								name: "Goblin",
								summary: "A small creature",
								tags: ["small"],
								source: { doc: "mm" },
							},
						],
					}),
				})
				.mockResolvedValue({ response: "{}" });

			const results = await service.searchContent("goblin");

			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results[0]).toMatchObject({
				id: "goblin-1",
				metadata: expect.objectContaining({
					entityType: "monsters",
					name: "Goblin",
					summary: "A small creature",
				}),
				text: "A small creature",
			});
		});

		it("should continue when some content type calls fail", async () => {
			mockAI.run
				.mockRejectedValueOnce(new Error("AI error"))
				.mockResolvedValueOnce({
					response: JSON.stringify({
						npcs: [
							{
								id: "fireball",
								type: "spell",
								name: "Fireball",
								summary: "Explosive spell",
								tags: ["evocation"],
								source: { doc: "phb" },
							},
						],
					}),
				})
				.mockResolvedValue({ response: "{}" });

			const results = await service.searchContent("fireball");

			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results[0].metadata).toMatchObject({
				entityType: "npcs",
				name: "Fireball",
			});
		});

		it("should return empty array when AI binding is not available", async () => {
			const envWithoutAI = { AI: undefined } as any;
			const serviceWithoutAI = new LibraryContentSearchService(envWithoutAI);

			const results = await serviceWithoutAI.searchContent("query");

			expect(results).toEqual([]);
			expect(mockAI.run).not.toHaveBeenCalled();
		});

		it("should handle malformed JSON in AI response", async () => {
			mockAI.run.mockResolvedValue({
				response: "not valid json {",
			});

			const results = await service.searchContent("query");

			expect(results).toEqual([]);
		});
	});
});
