import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockCampaignDAO,
	mockFileDAO,
	mockQueueDiscovery,
	mockTryCopy,
	mockLibDao,
} = vi.hoisted(() => ({
	mockCampaignDAO: {
		setCampaignResourceEntityCopyStatus: vi.fn(),
		listResourcesPendingLibraryCopy: vi.fn(),
		listFileKeysPendingLibraryCopy: vi.fn(),
		getCampaignById: vi.fn(),
	},
	mockFileDAO: { getFileForRag: vi.fn() },
	mockQueueDiscovery: vi.fn(),
	mockTryCopy: vi.fn(),
	mockLibDao: {
		isSchemaReady: vi.fn(),
		getDiscovery: vi.fn(),
		listCandidatesForFile: vi.fn(),
	},
}));

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({
		campaignDAO: mockCampaignDAO,
		fileDAO: mockFileDAO,
	})),
}));

vi.mock("@/dao/library-entity-dao", () => ({
	LibraryEntityDAO: class {
		isSchemaReady = mockLibDao.isSchemaReady;
		getDiscovery = mockLibDao.getDiscovery;
		listCandidatesForFile = mockLibDao.listCandidatesForFile;
	},
}));

vi.mock("@/services/campaign/library-entity-copy-to-campaign-service", () => ({
	tryCopyLibraryEntitiesToCampaign: mockTryCopy,
}));

vi.mock("@/services/campaign/library-entity-discovery-queue-service", () => ({
	LibraryEntityDiscoveryQueueService: {
		queueDiscoveryAfterIndexing: mockQueueDiscovery,
	},
}));

import {
	ensureLibraryDiscoveryAndMarkResourcePending,
	processPendingCampaignEntityCopiesForFile,
	sweepPendingCampaignEntityCopies,
} from "@/services/campaign/pending-campaign-entity-copy";

const env = { DB: {} } as any;

const baseOptions = {
	env,
	username: "gm",
	campaignId: "campaign-1",
	resourceId: "resource-1",
	fileKey: "library/gm/book.pdf",
	fileName: "book.pdf",
};

describe("ensureLibraryDiscoveryAndMarkResourcePending", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCampaignDAO.setCampaignResourceEntityCopyStatus.mockResolvedValue(
			undefined
		);
		mockQueueDiscovery.mockResolvedValue(undefined);
	});

	it("marks the resource pending before queueing discovery", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({ status: "completed" });
		const callOrder: string[] = [];
		mockCampaignDAO.setCampaignResourceEntityCopyStatus.mockImplementation(
			async () => {
				callOrder.push("mark");
			}
		);
		mockQueueDiscovery.mockImplementation(async () => {
			callOrder.push("queue");
		});

		await ensureLibraryDiscoveryAndMarkResourcePending(baseOptions);

		// Discovery completion sweeps for pending rows, so the row must exist first.
		expect(callOrder).toEqual(["mark", "queue"]);
	});

	it("marks the resource pending with the given attribution", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({ status: "completed" });

		await ensureLibraryDiscoveryAndMarkResourcePending({
			...baseOptions,
			pendingAttribution: { proposedBy: "player", approvedBy: "gm" },
		});

		expect(
			mockCampaignDAO.setCampaignResourceEntityCopyStatus
		).toHaveBeenCalledWith(
			"campaign-1",
			"resource-1",
			"pending_library",
			JSON.stringify({ proposedBy: "player", approvedBy: "gm" })
		);
	});

	it("still marks pending but defers discovery while the file is indexing", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({ status: "processing" });

		await ensureLibraryDiscoveryAndMarkResourcePending(baseOptions);

		expect(
			mockCampaignDAO.setCampaignResourceEntityCopyStatus
		).toHaveBeenCalledWith("campaign-1", "resource-1", "pending_library", null);
		// Queueing now would only burn the discovery job's retry budget; the
		// sync queue queues discovery when indexing finishes.
		expect(mockQueueDiscovery).not.toHaveBeenCalled();
	});

	it("defers discovery when the file record is missing", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue(null);

		await ensureLibraryDiscoveryAndMarkResourcePending(baseOptions);

		expect(mockQueueDiscovery).not.toHaveBeenCalled();
	});
});

describe("processPendingCampaignEntityCopiesForFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLibDao.isSchemaReady.mockResolvedValue(true);
		mockCampaignDAO.setCampaignResourceEntityCopyStatus.mockResolvedValue(
			undefined
		);
	});

	it("copies entities and completes the resource once discovery is done", async () => {
		mockLibDao.getDiscovery.mockResolvedValue({ status: "complete" });
		mockCampaignDAO.listResourcesPendingLibraryCopy.mockResolvedValue([
			{
				id: "resource-1",
				campaign_id: "campaign-1",
				file_name: "book.pdf",
				pending_attribution: null,
			},
		]);
		mockCampaignDAO.getCampaignById.mockResolvedValue({
			username: "gm",
			name: "Campaign One",
		});
		mockLibDao.listCandidatesForFile.mockResolvedValue([{ id: "c1" }]);
		mockTryCopy.mockResolvedValue(true);

		await processPendingCampaignEntityCopiesForFile(env, "library/gm/book.pdf");

		expect(mockTryCopy).toHaveBeenCalledWith(
			expect.objectContaining({
				campaignId: "campaign-1",
				resourceId: "resource-1",
			})
		);
		expect(
			mockCampaignDAO.setCampaignResourceEntityCopyStatus
		).toHaveBeenCalledWith("campaign-1", "resource-1", "complete", null);
	});

	it("does nothing while discovery is still running", async () => {
		mockLibDao.getDiscovery.mockResolvedValue({ status: "processing" });

		await processPendingCampaignEntityCopiesForFile(env, "library/gm/book.pdf");

		expect(
			mockCampaignDAO.listResourcesPendingLibraryCopy
		).not.toHaveBeenCalled();
		expect(mockTryCopy).not.toHaveBeenCalled();
	});
});

describe("sweepPendingCampaignEntityCopies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLibDao.isSchemaReady.mockResolvedValue(true);
		mockCampaignDAO.setCampaignResourceEntityCopyStatus.mockResolvedValue(
			undefined
		);
		mockCampaignDAO.getCampaignById.mockResolvedValue({
			username: "gm",
			name: "Campaign One",
		});
	});

	it("finishes a pending resource whose discovery completed after it was marked", async () => {
		mockCampaignDAO.listFileKeysPendingLibraryCopy.mockResolvedValue([
			"library/gm/book.pdf",
		]);
		mockLibDao.getDiscovery.mockResolvedValue({ status: "complete" });
		mockCampaignDAO.listResourcesPendingLibraryCopy.mockResolvedValue([
			{
				id: "resource-1",
				campaign_id: "campaign-1",
				file_name: "book.pdf",
				pending_attribution: null,
			},
		]);
		mockLibDao.listCandidatesForFile.mockResolvedValue([{ id: "c1" }]);
		mockTryCopy.mockResolvedValue(true);

		const result = await sweepPendingCampaignEntityCopies(env);

		expect(result.swept).toBe(1);
		expect(
			mockCampaignDAO.setCampaignResourceEntityCopyStatus
		).toHaveBeenCalledWith("campaign-1", "resource-1", "complete", null);
	});

	it("queues discovery for a RAG-complete file that never got a discovery row", async () => {
		mockCampaignDAO.listFileKeysPendingLibraryCopy.mockResolvedValue([
			"library/gm/book.pdf",
		]);
		mockLibDao.getDiscovery.mockResolvedValue(null);
		mockCampaignDAO.listResourcesPendingLibraryCopy.mockResolvedValue([
			{
				id: "resource-1",
				campaign_id: "campaign-1",
				file_name: "book.pdf",
				pending_attribution: null,
			},
		]);
		mockFileDAO.getFileForRag.mockResolvedValue({ status: "completed" });

		await sweepPendingCampaignEntityCopies(env);

		expect(mockQueueDiscovery).toHaveBeenCalledWith(
			env,
			"library/gm/book.pdf",
			"gm"
		);
	});

	it("leaves a still-indexing file alone", async () => {
		mockCampaignDAO.listFileKeysPendingLibraryCopy.mockResolvedValue([
			"library/gm/book.pdf",
		]);
		mockLibDao.getDiscovery.mockResolvedValue(null);
		mockCampaignDAO.listResourcesPendingLibraryCopy.mockResolvedValue([
			{
				id: "resource-1",
				campaign_id: "campaign-1",
				file_name: "book.pdf",
				pending_attribution: null,
			},
		]);
		mockFileDAO.getFileForRag.mockResolvedValue({ status: "processing" });

		await sweepPendingCampaignEntityCopies(env);

		expect(mockQueueDiscovery).not.toHaveBeenCalled();
		expect(mockTryCopy).not.toHaveBeenCalled();
	});

	it("keeps sweeping after one file throws", async () => {
		mockCampaignDAO.listFileKeysPendingLibraryCopy.mockResolvedValue([
			"library/gm/bad.pdf",
			"library/gm/good.pdf",
		]);
		mockLibDao.getDiscovery.mockImplementation(async (fileKey: string) => {
			if (fileKey === "library/gm/bad.pdf") {
				throw new Error("boom");
			}
			return { status: "complete" };
		});
		mockCampaignDAO.listResourcesPendingLibraryCopy.mockResolvedValue([]);

		const result = await sweepPendingCampaignEntityCopies(env);

		expect(result.swept).toBe(1);
	});
});
