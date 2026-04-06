import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectFileContentExtractionProvider } from "@/services/campaign/impl/direct-file-content-extraction-provider";

const { mockExtractText } = vi.hoisted(() => ({
	mockExtractText: vi.fn(),
}));

vi.mock("@/services/file/file-extraction-service", () => ({
	FileExtractionService: class FileExtractionServiceMock {
		extractText = mockExtractText;
	},
}));

describe("DirectFileContentExtractionProvider", () => {
	const env = { OPENAI_API_KEY: "sk-test-key" } as any;

	beforeEach(() => {
		mockExtractText.mockReset();
		mockExtractText.mockResolvedValue({
			text: "Visual inspiration reference\n\nMisty forest at dusk.",
		});
	});

	it("extracts image content via FileExtractionService and sets isVisualInspiration", async () => {
		const r2Helper = {
			get: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
			getContentType: vi.fn().mockResolvedValue("image/png"),
		};
		const provider = new DirectFileContentExtractionProvider(
			env,
			r2Helper as any
		);

		const result = await provider.extractContent({
			resource: {
				id: "k1",
				file_key: "library/user/forest.png",
				file_name: "forest.png",
			},
		});

		expect(result.success).toBe(true);
		expect(result.content).toContain("Visual inspiration reference");
		expect(result.metadata?.isVisualInspiration).toBe(true);
		expect(result.metadata?.contentType).toBe("image/png");
		expect(mockExtractText).toHaveBeenCalledWith(
			expect.any(ArrayBuffer),
			"image/png"
		);
	});

	it("detects image from filename when content type is missing", async () => {
		const r2Helper = {
			get: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
			getContentType: vi.fn().mockResolvedValue(null),
		};
		const provider = new DirectFileContentExtractionProvider(
			env,
			r2Helper as any
		);

		const result = await provider.extractContent({
			resource: {
				id: "k2",
				file_key: "library/user/photo.jpg",
				file_name: "photo.jpg",
			},
		});

		expect(result.success).toBe(true);
		expect(result.metadata?.isVisualInspiration).toBe(true);
		expect(mockExtractText).toHaveBeenCalledWith(
			expect.any(ArrayBuffer),
			"image/jpeg"
		);
	});
});
