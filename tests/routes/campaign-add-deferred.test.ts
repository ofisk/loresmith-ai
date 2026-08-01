import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adding a file that is still processing must be queued, not rejected: the
 * campaign resource is created immediately and marked `pending_library`, and the
 * library pipeline finishes the add (staging shards) when processing completes.
 */

const {
	mockCampaignDAO,
	mockFileDAO,
	mockAddResourceToCampaign,
	mockCheckResourceExists,
	mockValidateOwnership,
	mockTryCopy,
	mockEnsurePending,
	mockLibDao,
	mockProcessFileUpload,
	mockCheckAddLimit,
	mockRecordAdd,
} = vi.hoisted(() => ({
	mockCampaignDAO: { getCampaignById: vi.fn() },
	mockFileDAO: { getFileForRag: vi.fn() },
	mockAddResourceToCampaign: vi.fn(),
	mockCheckResourceExists: vi.fn(),
	mockValidateOwnership: vi.fn(),
	mockTryCopy: vi.fn(),
	mockEnsurePending: vi.fn(),
	mockLibDao: { isSchemaReady: vi.fn(), getDiscovery: vi.fn() },
	mockProcessFileUpload: vi.fn(),
	mockCheckAddLimit: vi.fn(),
	mockRecordAdd: vi.fn(),
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
	},
}));

vi.mock("@/lib/campaign-operations", () => ({
	addResourceToCampaign: mockAddResourceToCampaign,
	checkResourceExists: mockCheckResourceExists,
	createCampaign: vi.fn(),
	validateCampaignOwnership: mockValidateOwnership,
}));

vi.mock("@/lib/route-utils", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		requireCanEdit: vi.fn().mockResolvedValue(undefined),
		getCampaignRole: vi.fn().mockResolvedValue("owner"),
	};
});

vi.mock("@/services/campaign/library-entity-copy-to-campaign-service", () => ({
	tryCopyLibraryEntitiesToCampaign: mockTryCopy,
}));

vi.mock("@/services/campaign/pending-campaign-entity-copy", () => ({
	ensureLibraryDiscoveryAndMarkResourcePending: mockEnsurePending,
}));

vi.mock("@/services/file/sync-queue-service", () => ({
	SyncQueueService: { processFileUpload: mockProcessFileUpload },
}));

vi.mock("@/services/resource-add-rate-limit-service", () => ({
	ResourceAddRateLimitService: {
		checkAddLimit: mockCheckAddLimit,
		recordAdd: mockRecordAdd,
	},
}));

import { handleAddResourceToCampaign } from "@/routes/campaigns";

type JsonResult = { body: any; status: number };

function createContext(body: { type?: string; id?: string; name?: string }): {
	c: any;
	result: () => JsonResult;
} {
	let captured: JsonResult = { body: undefined, status: 200 };
	const c = {
		env: { DB: {}, R2: { get: vi.fn().mockResolvedValue(null) } },
		userAuth: { username: "gm", isAdmin: false },
		get: () => undefined,
		set: () => undefined,
		req: {
			param: (key: string) => (key === "campaignId" ? "campaign-1" : undefined),
			json: async () => body,
			header: () => undefined,
			raw: { headers: new Headers() },
		},
		json: (payload: any, status = 200) => {
			captured = { body: payload, status };
			return payload;
		},
	};
	return { c, result: () => captured };
}

describe("handleAddResourceToCampaign — deferred adds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateOwnership.mockResolvedValue({ valid: true });
		mockCampaignDAO.getCampaignById.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Campaign One",
			username: "gm",
		});
		mockCheckResourceExists.mockResolvedValue({ exists: false });
		mockCheckAddLimit.mockResolvedValue({ allowed: true });
		mockRecordAdd.mockResolvedValue(undefined);
		mockAddResourceToCampaign.mockResolvedValue(undefined);
		mockEnsurePending.mockResolvedValue(undefined);
		mockLibDao.isSchemaReady.mockResolvedValue(true);
	});

	it("queues the add when the file is still indexing", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({
			file_name: "book.pdf",
			status: "processing",
			file_size: 10,
			updated_at: "now",
		});
		mockLibDao.getDiscovery.mockResolvedValue(null);
		mockTryCopy.mockResolvedValue(false);

		const { c, result } = createContext({
			type: "file",
			id: "library/gm/book.pdf",
			name: "book.pdf",
		});
		await handleAddResourceToCampaign(c);

		const { body, status } = result();
		expect(status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.pending).toBe(true);
		expect(body.pendingReason).toBe("file_processing");
		expect(body.message).toMatch(/still processing/i);
		// The resource row is created now so the completion hook can find it.
		expect(mockAddResourceToCampaign).toHaveBeenCalledWith(
			expect.objectContaining({ deferred: true })
		);
		expect(mockEnsurePending).toHaveBeenCalledTimes(1);
		// A file that is on its way to `completed` must not be re-indexed.
		expect(mockProcessFileUpload).not.toHaveBeenCalled();
	});

	it("queues the add when library entity discovery is still in flight", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({
			file_name: "book.pdf",
			status: "completed",
			file_size: 10,
			updated_at: "now",
		});
		mockLibDao.getDiscovery.mockResolvedValue({ status: "processing" });
		mockTryCopy.mockResolvedValue(false);

		const { c, result } = createContext({
			type: "file",
			id: "library/gm/book.pdf",
			name: "book.pdf",
		});
		await handleAddResourceToCampaign(c);

		const { body, status } = result();
		expect(status).toBe(200);
		expect(body.pending).toBe(true);
		expect(body.pendingReason).toBe("entity_indexing");
		expect(body.libraryEntityDiscoveryStatus).toBe("processing");
		expect(mockEnsurePending).toHaveBeenCalledTimes(1);
	});

	it("adds immediately when the file is fully ready", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({
			file_name: "book.pdf",
			status: "completed",
			file_size: 10,
			updated_at: "now",
		});
		mockLibDao.getDiscovery.mockResolvedValue({ status: "complete" });
		mockTryCopy.mockResolvedValue(true);

		const { c, result } = createContext({
			type: "file",
			id: "library/gm/book.pdf",
			name: "book.pdf",
		});
		await handleAddResourceToCampaign(c);

		const { body } = result();
		expect(body.pending).toBe(false);
		expect(body.pendingReason).toBeUndefined();
		expect(mockAddResourceToCampaign).toHaveBeenCalledWith(
			expect.objectContaining({ deferred: false })
		);
		expect(mockEnsurePending).not.toHaveBeenCalled();
	});

	it("still rejects a file in a terminal error state and triggers a re-index", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({
			file_name: "book.pdf",
			status: "error",
			file_size: 10,
			updated_at: "now",
		});

		const { c, result } = createContext({
			type: "file",
			id: "library/gm/book.pdf",
			name: "book.pdf",
		});
		await handleAddResourceToCampaign(c);

		const { body, status } = result();
		expect(status).toBe(400);
		expect(body.error).toBe("File is not yet indexed");
		expect(mockProcessFileUpload).toHaveBeenCalledTimes(1);
		expect(mockAddResourceToCampaign).not.toHaveBeenCalled();
	});

	it("never returns the old LIBRARY_DISCOVERY_IN_PROGRESS rejection", async () => {
		mockFileDAO.getFileForRag.mockResolvedValue({
			file_name: "book.pdf",
			status: "completed",
			file_size: 10,
			updated_at: "now",
		});
		mockLibDao.getDiscovery.mockResolvedValue({ status: "pending" });
		mockTryCopy.mockResolvedValue(false);

		const { c, result } = createContext({
			type: "file",
			id: "library/gm/book.pdf",
			name: "book.pdf",
		});
		await handleAddResourceToCampaign(c);

		const { body, status } = result();
		expect(status).not.toBe(409);
		expect(body.code).toBeUndefined();
	});
});
