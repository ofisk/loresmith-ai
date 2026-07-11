import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	PROCESSING_CHUNK_INDEX_STRIDE,
	persistFileTextChunks,
	persistProcessingChunkTextChunks,
} from "../../src/services/file/file-chunk-persistence";

describe("file-chunk-persistence", () => {
	const mockFileDAO = {
		replaceFileChunks: vi.fn(),
		updateFileMetadata: vi.fn(),
		replaceFileChunksInIndexRange: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockFileDAO.replaceFileChunks.mockResolvedValue(undefined);
		mockFileDAO.updateFileMetadata.mockResolvedValue(undefined);
		mockFileDAO.replaceFileChunksInIndexRange.mockResolvedValue(undefined);
	});

	it("persists embedding chunks and updates vector_id + chunk_count", async () => {
		await persistFileTextChunks(
			mockFileDAO as any,
			"library/user/doc.pdf",
			"user",
			[
				{ chunkIndex: 0, text: "hello", vectorId: "v_a" },
				{ chunkIndex: 1, text: "world", vectorId: "v_b" },
			],
			{ vectorId: "v_a" }
		);

		expect(mockFileDAO.replaceFileChunks).toHaveBeenCalledWith(
			"library/user/doc.pdf",
			"user",
			[
				{ chunkIndex: 0, content: "hello", embedding: "v_a" },
				{ chunkIndex: 1, content: "world", embedding: "v_b" },
			]
		);
		expect(mockFileDAO.updateFileMetadata).toHaveBeenCalledWith(
			"library/user/doc.pdf",
			{ vector_id: "v_a", chunk_count: 2 }
		);
	});

	it("persists processing-chunk text in a stable index range for retries", async () => {
		await persistProcessingChunkTextChunks(
			mockFileDAO as any,
			"library/user/big.pdf",
			"user",
			2,
			[{ chunkIndex: 0, text: "page range text", vectorId: "v_pc2" }]
		);

		const base = 2 * PROCESSING_CHUNK_INDEX_STRIDE;
		expect(mockFileDAO.replaceFileChunksInIndexRange).toHaveBeenCalledWith(
			"library/user/big.pdf",
			"user",
			base,
			base + PROCESSING_CHUNK_INDEX_STRIDE,
			[
				{
					id: "library/user/big.pdf-pc2-0",
					chunkIndex: base,
					content: "page range text",
					embedding: "v_pc2",
				},
			]
		);
	});
});
