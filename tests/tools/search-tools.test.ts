import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignRole: vi.fn(),
	},
	entityDAO: {
		getEntityById: vi.fn(),
		searchEntitiesByName: vi.fn(),
		listEntitiesByCampaign: vi.fn(),
		getEntitiesByIds: vi.fn(),
		getEntityCountByCampaign: vi.fn(),
	},
	entityGraphService: {
		getNeighbors: vi.fn(),
		getRelationshipsForEntities: vi.fn(),
		getRelationshipsForEntity: vi.fn().mockResolvedValue([]),
	},
	fileDAO: {
		getFileChunks: vi.fn(),
	},
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/graph/world-state-changelog-service", () => ({
	WorldStateChangelogService: class {
		async getOverlaySnapshot() {
			return null;
		}
	},
}));

vi.mock("@/services/rag/rag-service-factory", () => ({
	getPlanningServices: vi.fn(async () => ({
		planningContext: { search: vi.fn().mockResolvedValue([]) },
		openaiApiKey: null,
	})),
}));

import {
	calculateNameSimilarity,
	listAllEntities,
	searchCampaignContext,
} from "@/tools/campaign-context/search-tools";

describe("calculateNameSimilarity", () => {
	it("returns 1.0 for exact match after normalization", () => {
		expect(calculateNameSimilarity("dragon", "Dragon")).toBe(1);
		expect(
			calculateNameSimilarity("Young Red Dragon", "young red dragon")
		).toBe(1);
	});

	it("returns 0.8 when longer string starts with shorter (partial match)", () => {
		expect(calculateNameSimilarity("dragon", "Dragon Queen")).toBe(0.8);
		expect(calculateNameSimilarity("Dragon Queen", "dragon")).toBe(0.8);
	});

	it("returns 0.6 for contains match without startWith", () => {
		expect(calculateNameSimilarity("dragon", "Young Red Dragon")).toBe(0.6);
	});

	it("returns 0.7 for all words matching in different order", () => {
		expect(calculateNameSimilarity("red dragon", "Dragon Red")).toBe(0.7);
	});

	it("returns 0.5 for some words matching", () => {
		expect(calculateNameSimilarity("fire dragon", "Goblin Dragon")).toBe(0.5);
	});

	it("returns 0.0 when no meaningful match", () => {
		expect(calculateNameSimilarity("xyz", "Dragon")).toBe(0);
	});

	it("strips articles from query", () => {
		expect(calculateNameSimilarity("the dragon", "Dragon")).toBe(1);
		expect(calculateNameSimilarity("a young wolf", "Young Wolf")).toBe(1);
	});
});

describe("searchCampaignContext", () => {
	const jwt = "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y";
	const options = {
		toolCallId: "search-1",
		messages: [] as any[],
		env: { DB: {} },
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Test campaign",
			description: null,
			metadata: null,
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("dm");
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue([
			{
				id: "ent-1",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Fire Drake",
				content: {},
				metadata: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			},
		]);
		mockDaoFactory.entityDAO.getEntityCountByCampaign.mockResolvedValue(1);
		mockDaoFactory.entityGraphService.getNeighbors.mockResolvedValue([]);
		mockDaoFactory.entityGraphService.getRelationshipsForEntities.mockResolvedValue(
			new Map()
		);
	});

	it("returns entities from list path when no semantic search (list-all query)", async () => {
		const result = await searchCampaignContext.execute(
			{
				campaignId: "campaign-1",
				query: "monsters",
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.results).toBeDefined();
		expect(result.result.data.results.length).toBeGreaterThan(0);
		expect(result.result.data.results[0].filename).toBe("Fire Drake");
	});

	it("returns empty results when no entities match", async () => {
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue([]);
		mockDaoFactory.entityDAO.getEntityCountByCampaign.mockResolvedValue(0);

		const result = await searchCampaignContext.execute(
			{
				campaignId: "campaign-1",
				query: "monsters",
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.results).toEqual([]);
	});

	it("handles 404 when campaign not found", async () => {
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue(
			null
		);

		const result = await searchCampaignContext.execute(
			{
				campaignId: "campaign-1",
				query: "monsters",
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as any).errorCode).toBe(404);
	});

	it("handles 401 when JWT is invalid", async () => {
		const result = await searchCampaignContext.execute(
			{
				campaignId: "campaign-1",
				query: "monsters",
				jwt: null,
			},
			options
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as any).errorCode).toBe(401);
	});
});

describe("listAllEntities", () => {
	const jwt = "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y";
	const options = {
		toolCallId: "list-1",
		messages: [] as any[],
		env: { DB: {} },
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Test campaign",
			description: null,
			metadata: null,
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("dm");
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue([
			{
				id: "ent-1",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Goblin",
				content: {},
				metadata: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			},
		]);
		mockDaoFactory.entityDAO.getEntityCountByCampaign.mockResolvedValue(1);
	});

	it("returns paginated results with totalCount and totalPages", async () => {
		mockDaoFactory.entityDAO.getEntityCountByCampaign.mockResolvedValue(150);
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue(
			Array.from({ length: 100 }, (_, i) => ({
				id: `ent-${i}`,
				campaignId: "campaign-1",
				entityType: "monsters",
				name: `Monster ${i}`,
				content: {},
				metadata: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			}))
		);

		const result = await listAllEntities.execute(
			{
				campaignId: "campaign-1",
				page: 1,
				pageSize: 100,
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.totalCount).toBe(150);
		expect(result.result.data.totalPages).toBe(2);
		expect(result.result.data.results.length).toBe(100);
	});

	it("filters by entityType when provided", async () => {
		await listAllEntities.execute(
			{
				campaignId: "campaign-1",
				entityType: "npcs",
				page: 1,
				pageSize: 100,
				jwt,
			},
			options
		);

		expect(
			mockDaoFactory.entityDAO.listEntitiesByCampaign
		).toHaveBeenCalledWith(
			"campaign-1",
			expect.objectContaining({
				entityType: "npcs",
				limit: 100,
				offset: 0,
				orderBy: "name",
			})
		);
	});

	it("excludes stubs when includeStubs is false", async () => {
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue([
			{
				id: "ent-1",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Goblin",
				content: {},
				metadata: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			},
			{
				id: "ent-stub",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Stub monster",
				content: {},
				metadata: { isStub: true },
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			},
		]);
		mockDaoFactory.entityDAO.getEntityCountByCampaign.mockResolvedValue(2);

		const result = await listAllEntities.execute(
			{
				campaignId: "campaign-1",
				includeStubs: false,
				page: 1,
				pageSize: 100,
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.results.length).toBe(1);
		expect(result.result.data.results[0].name).toBe("Goblin");
	});

	it("handles 404 when campaign not found", async () => {
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue(
			null
		);

		const result = await listAllEntities.execute(
			{
				campaignId: "campaign-1",
				page: 1,
				jwt,
			},
			options
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as any).errorCode).toBe(404);
	});

	it("returns error when env is not available", async () => {
		const result = await listAllEntities.execute(
			{
				campaignId: "campaign-1",
				page: 1,
				jwt,
			},
			{ toolCallId: "list-1", messages: [] } as any
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as any).errorCode).toBe(500);
	});
});
