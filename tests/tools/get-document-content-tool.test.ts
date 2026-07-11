import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(),
}));

vi.mock("../../src/tools/utils", async () => {
	const actual = await vi.importActual<typeof import("../../src/tools/utils")>(
		"../../src/tools/utils"
	);
	return {
		...actual,
		getEnvFromContext: vi.fn(),
		extractUsernameFromJwt: vi.fn(() => "user-1"),
		requireCanSeeSpoilersForTool: vi.fn(async () => ({ userId: "user-1" })),
	};
});

import { getDAOFactory } from "../../src/dao/dao-factory";
import { getDocumentContent } from "../../src/tools/campaign-context/get-document-content-tool";
import {
	extractUsernameFromJwt,
	getEnvFromContext,
	requireCanSeeSpoilersForTool,
} from "../../src/tools/utils";

describe("getDocumentContent", () => {
	const mockFileDAO = {
		getFileChunksForRag: vi.fn(),
		getFileMetadata: vi.fn(),
	};
	const mockCampaignDAO = {
		getCampaignById: vi.fn(),
		getCampaignResources: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		(getEnvFromContext as any).mockReturnValue({ DB: {} });
		(extractUsernameFromJwt as any).mockReturnValue("user-1");
		(requireCanSeeSpoilersForTool as any).mockResolvedValue({
			userId: "user-1",
		});
		(getDAOFactory as any).mockReturnValue({
			fileDAO: mockFileDAO,
			campaignDAO: mockCampaignDAO,
		});
		mockCampaignDAO.getCampaignById.mockResolvedValue({ id: "camp-1" });
		mockCampaignDAO.getCampaignResources.mockResolvedValue([
			{
				file_key: "library/user-1/dhrolin.pdf",
				file_name: "Dr Dhrolin's dictionary of dinosaurs.pdf",
				display_name: "Dr Dhrolin's dictionary of dinosaurs",
			},
		]);
	});

	it("does not claim extraction failed when completed with zero chunks", async () => {
		mockFileDAO.getFileChunksForRag.mockResolvedValue([]);
		mockFileDAO.getFileMetadata.mockResolvedValue({ status: "completed" });

		const result = await (getDocumentContent as any).execute(
			{
				campaignId: "camp-1",
				fileIdentifier: "Dr Dhrolin's dictionary of dinosaurs",
				jwt: "token",
			},
			{ toolCallId: "t1" }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.message).toContain("no stored text chunks");
		expect(result.result.message).not.toMatch(/still be processing/i);
		expect(result.result.message).toMatch(
			/Do not assume PDF extraction failed/i
		);
		expect(result.result.data.chunkCount).toBe(0);
		expect(result.result.data.suggestEntitySearch).toBe(true);
		expect(result.result.data.suggestReindex).toBe(true);
		expect(result.result.data.status).toBe("completed");
	});

	it("says still processing when status is not completed", async () => {
		mockFileDAO.getFileChunksForRag.mockResolvedValue([]);
		mockFileDAO.getFileMetadata.mockResolvedValue({ status: "indexing" });

		const result = await (getDocumentContent as any).execute(
			{
				campaignId: "camp-1",
				fileIdentifier: "dhrolin",
				jwt: "token",
			},
			{ toolCallId: "t2" }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.message).toMatch(/still be processing/i);
		expect(result.result.data.suggestEntitySearch).toBe(false);
	});

	it("returns chunks when present", async () => {
		mockFileDAO.getFileChunksForRag.mockResolvedValue([
			{ chunk_index: 0, chunk_text: "A Pluvenn is a dinosaur." },
		]);

		const result = await (getDocumentContent as any).execute(
			{
				campaignId: "camp-1",
				fileIdentifier: "dhrolin",
				jwt: "token",
				maxChunks: 10,
			},
			{ toolCallId: "t3" }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.chunkCount).toBe(1);
		expect(result.result.data.chunks[0].text).toContain("Pluvenn");
	});
});
