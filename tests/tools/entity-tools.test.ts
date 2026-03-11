import { beforeEach, describe, expect, it, vi } from "vitest";

const { getResolvedRulesContextMock } = vi.hoisted(() => ({
	getResolvedRulesContextMock: vi.fn(),
}));

vi.mock("@/lib/tool-auth", () => ({
	authenticatedFetch: vi.fn(),
	handleAuthError: vi.fn(),
}));

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignRole: vi.fn(),
	},
	entityDAO: {
		getEntityById: vi.fn(),
		createEntity: vi.fn(),
		updateEntity: vi.fn(),
		deleteEntity: vi.fn(),
	},
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/campaign/rules-context-service", () => ({
	RulesContextService: {
		getResolvedRulesContext: (...args: unknown[]) =>
			getResolvedRulesContextMock(...args),
		resolveRules: vi.fn((rules: unknown[]) => ({
			rules,
			conflicts: [],
			warnings: [],
		})),
	},
}));

import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import {
	deleteEntityTool,
	extractEntitiesFromContentTool,
	listHouseRulesTool,
	updateEntityMetadataTool,
} from "@/tools/campaign-context/entity-tools";

const jwt = "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y";
const makeResponse = (data: unknown, ok = true, status = 200) => ({
	ok,
	status,
	json: vi.fn().mockResolvedValue(data),
});

describe("entity tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Test campaign",
			description: null,
			metadata: null,
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("dm");
		getResolvedRulesContextMock.mockResolvedValue({
			rules: [],
			conflicts: [],
			warnings: [],
		});
	});

	describe("extractEntitiesFromContentTool", () => {
		it("API fallback returns success when env is null", async () => {
			(authenticatedFetch as any).mockResolvedValue(
				makeResponse({
					entities: [{ id: "ent-1", name: "Dragon" }],
					relationships: [],
					count: 1,
				})
			);

			const result = await extractEntitiesFromContentTool.execute(
				{
					campaignId: "campaign-1",
					content: "A fierce dragon guarded the tower.",
					jwt,
				},
				{ toolCallId: "extract-1", messages: [] }
			);

			expect(result.result.success).toBe(true);
			expect(authenticatedFetch).toHaveBeenCalledWith(
				expect.stringContaining("/entities/extract"),
				expect.objectContaining({
					method: "POST",
					jwt,
					body: expect.stringContaining("dragon"),
				})
			);
		});

		it("API fallback returns error on auth failure", async () => {
			(authenticatedFetch as any).mockResolvedValue(
				makeResponse({}, false, 401)
			);
			(handleAuthError as any).mockReturnValue("Auth failed");

			const result = await extractEntitiesFromContentTool.execute(
				{
					campaignId: "campaign-1",
					content: "Some content",
					jwt,
				},
				{ toolCallId: "extract-2", messages: [] }
			);

			expect(result.result.success).toBe(false);
			expect(result.result.message).toBe("Auth failed");
		});
	});

	describe("listHouseRulesTool", () => {
		it("returns house rules from RulesContextService", async () => {
			getResolvedRulesContextMock.mockResolvedValue({
				rules: [
					{
						id: "rule-1",
						entityId: "rule-1",
						entityType: "house_rule",
						name: "Bonus action healing",
						text: "Drinking your own potion is a bonus action.",
						category: "healing",
						source: "house",
						priority: 100,
						active: true,
						updatedAt: "2024-01-01T00:00:00.000Z",
						metadata: {},
					},
				],
				conflicts: [],
				warnings: [],
			});

			const result = await listHouseRulesTool.execute(
				{
					campaignId: "campaign-1",
					jwt,
				},
				{ toolCallId: "list-rules-1", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(true);
			expect(result.result.data.rules).toHaveLength(1);
			expect(result.result.data.rules[0].name).toBe("Bonus action healing");
			expect(result.result.data.count).toBe(1);
		});

		it("returns error when env is not available", async () => {
			const result = await listHouseRulesTool.execute(
				{ campaignId: "campaign-1", jwt },
				{ toolCallId: "list-rules-2", messages: [] }
			);

			expect(result.result.success).toBe(false);
			expect((result.result.data as { errorCode?: number }).errorCode).toBe(
				500
			);
		});

		it("returns 404 when campaign not found", async () => {
			mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue(
				null
			);

			const result = await listHouseRulesTool.execute(
				{ campaignId: "campaign-nonexistent", jwt },
				{ toolCallId: "list-rules-3", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(false);
			expect((result.result.data as { errorCode?: number }).errorCode).toBe(
				404
			);
		});
	});

	describe("updateEntityMetadataTool", () => {
		it("updates metadata via DAO when env is available", async () => {
			mockDaoFactory.entityDAO.getEntityById
				.mockResolvedValueOnce({
					id: "ent-1",
					campaignId: "campaign-1",
					entityType: "factions",
					name: "Blackwater cult",
					content: {},
					metadata: {},
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
				})
				.mockResolvedValueOnce({
					id: "ent-1",
					campaignId: "campaign-1",
					entityType: "factions",
					name: "Blackwater cult",
					content: {},
					metadata: { alignment: "antagonistic" },
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
				});

			const result = await updateEntityMetadataTool.execute(
				{
					campaignId: "campaign-1",
					entityId: "ent-1",
					metadata: { alignment: "antagonistic" },
					jwt,
				},
				{ toolCallId: "update-meta-1", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(true);
			expect(mockDaoFactory.entityDAO.updateEntity).toHaveBeenCalledWith(
				"ent-1",
				expect.objectContaining({
					metadata: expect.objectContaining({
						alignment: "antagonistic",
					}),
				})
			);
		});

		it("returns 404 when entity not found", async () => {
			mockDaoFactory.entityDAO.getEntityById.mockResolvedValue(null);

			const result = await updateEntityMetadataTool.execute(
				{
					campaignId: "campaign-1",
					entityId: "ent-nonexistent",
					metadata: { alignment: "neutral" },
					jwt,
				},
				{ toolCallId: "update-meta-2", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(false);
			expect((result.result.data as { errorCode?: number }).errorCode).toBe(
				404
			);
		});
	});

	describe("deleteEntityTool", () => {
		it("deletes entity when user has GM role", async () => {
			mockDaoFactory.entityDAO.getEntityById.mockResolvedValue({
				id: "ent-1",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Duplicate goblin",
				content: {},
				metadata: null,
				embeddingId: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			});

			const result = await deleteEntityTool.execute(
				{
					campaignId: "campaign-1",
					entityId: "ent-1",
					jwt,
				},
				{ toolCallId: "delete-1", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(true);
			expect(mockDaoFactory.entityDAO.deleteEntity).toHaveBeenCalledWith(
				"ent-1"
			);
		});

		it("returns 404 when entity not found", async () => {
			mockDaoFactory.entityDAO.getEntityById.mockResolvedValue(null);

			const result = await deleteEntityTool.execute(
				{
					campaignId: "campaign-1",
					entityId: "ent-nonexistent",
					jwt,
				},
				{ toolCallId: "delete-2", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(false);
			expect((result.result.data as { errorCode?: number }).errorCode).toBe(
				404
			);
		});

		it("returns 403 when entity belongs to different campaign", async () => {
			mockDaoFactory.entityDAO.getEntityById.mockResolvedValue({
				id: "ent-1",
				campaignId: "campaign-other",
				entityType: "monsters",
				name: "Goblin",
				content: {},
				metadata: null,
				embeddingId: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			});

			const result = await deleteEntityTool.execute(
				{
					campaignId: "campaign-1",
					entityId: "ent-1",
					jwt,
				},
				{ toolCallId: "delete-3", messages: [], env: { DB: {} } }
			);

			expect(result.result.success).toBe(false);
			expect((result.result.data as { errorCode?: number }).errorCode).toBe(
				403
			);
		});
	});
});
