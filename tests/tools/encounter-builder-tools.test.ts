import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupStatBlockExecuteMock, planningSearchMock } = vi.hoisted(() => ({
	lookupStatBlockExecuteMock: vi.fn(),
	planningSearchMock: vi.fn(),
}));

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
	},
	entityGraphService: {
		getNeighbors: vi.fn(),
		getRelationshipsForEntities: vi.fn(),
	},
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/rag/rag-service-factory", () => ({
	getPlanningServices: vi.fn(async () => ({
		planningContext: {
			search: planningSearchMock,
		},
	})),
}));

vi.mock("@/tools/campaign-context/rules-reference-tools", () => ({
	lookupStatBlockTool: {
		execute: lookupStatBlockExecuteMock,
	},
}));

import {
	generateEncounterTool,
	getEncounterStatBlocksTool,
	scaleEncounterTool,
} from "@/tools/campaign-context/encounter-builder-tools";

describe("encounter builder tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Ashfen campaign",
			description: "Dark marsh frontier",
			metadata: null,
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("dm");
		mockDaoFactory.entityDAO.getEntityById.mockResolvedValue({
			id: "loc-1",
			campaignId: "campaign-1",
			entityType: "locations",
			name: "Ashfen Marsh",
			content: { atmosphere: "fog" },
		});
		mockDaoFactory.entityDAO.searchEntitiesByName.mockResolvedValue([]);
		mockDaoFactory.entityDAO.listEntitiesByCampaign.mockResolvedValue([
			{
				id: "mon-1",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Bog lurker",
				content: { cr: "2" },
			},
			{
				id: "mon-2",
				campaignId: "campaign-1",
				entityType: "monsters",
				name: "Cult marsh stalker",
				content: { challengeRating: 5 },
			},
		]);
		mockDaoFactory.entityDAO.getEntitiesByIds.mockResolvedValue([
			{
				id: "fac-1",
				campaignId: "campaign-1",
				entityType: "factions",
				name: "Blackwater cult",
				content: {},
			},
			{
				id: "loc-1",
				campaignId: "campaign-1",
				entityType: "locations",
				name: "Ashfen Marsh",
				content: {},
			},
		]);
		mockDaoFactory.entityGraphService.getNeighbors.mockResolvedValue([
			{
				entityId: "mon-2",
				depth: 1,
				relationshipType: "inhabits",
				name: "Cult marsh stalker",
				entityType: "monsters",
			},
		]);
		mockDaoFactory.entityGraphService.getRelationshipsForEntities.mockResolvedValue(
			new Map([
				[
					"mon-2",
					[
						{
							fromEntityId: "mon-2",
							toEntityId: "fac-1",
							relationshipType: "serves_faction",
						},
						{
							fromEntityId: "mon-2",
							toEntityId: "loc-1",
							relationshipType: "inhabits_location",
						},
					],
				],
				["mon-1", []],
			])
		);
		planningSearchMock.mockResolvedValue([
			{
				sectionType: "encounter_seeds",
				sectionContent: "The cult has been preparing an ambush in the marsh.",
			},
		]);
		lookupStatBlockExecuteMock.mockResolvedValue({
			toolCallId: "rules-1",
			result: {
				success: true,
				message: "Found 1 stat block match.",
				data: {
					results: [{ title: "Bog lurker", excerpt: "Armor Class 13..." }],
				},
			},
		});
	});

	it("generateEncounterTool returns a grounded encounter spec", async () => {
		const result: any = await (generateEncounterTool as any).execute(
			{
				campaignId: "campaign-1",
				locationEntityId: "loc-1",
				partyLevel: 7,
				partySize: 4,
				targetDifficulty: "medium",
				theme: "cult ambush",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "enc-gen-1", messages: [], env: { DB: {} } } as any
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.encounterSpec).toBeDefined();
		expect(result.result.data.encounterSpec.composition.length).toBeGreaterThan(
			0
		);
		expect(result.result.data.encounterSpec.targetDifficulty).toBe("medium");
		expect(
			result.result.data.encounterSpec.composition[0].gmUsageAdvice.length
		).toBeGreaterThan(0);
		expect(
			result.result.data.encounterSpec.generalCombatAdvice.length
		).toBeGreaterThan(0);
	});

	it("scaleEncounterTool changes composition counts for harder difficulty", async () => {
		const result: any = await (scaleEncounterTool as any).execute(
			{
				campaignId: "campaign-1",
				targetDifficulty: "deadly",
				partyLevel: 9,
				partySize: 5,
				encounterSpec: {
					encounterSummary: "Initial encounter",
					composition: [
						{
							name: "Bog lurker",
							count: 2,
							threatEstimate: "low",
						},
					],
				},
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "enc-scale-1", messages: [], env: { DB: {} } } as any
		);

		expect(result.result.success).toBe(true);
		expect(
			result.result.data.scaledEncounterSpec.composition[0].count
		).toBeGreaterThan(2);
		expect(result.result.data.targetDifficulty).toBe("deadly");
		expect(
			result.result.data.scaledEncounterSpec.composition[0].gmUsageAdvice.length
		).toBeGreaterThan(0);
		expect(
			result.result.data.scaledEncounterSpec.generalCombatAdvice.length
		).toBeGreaterThan(0);
	});

	it("getEncounterStatBlocksTool aggregates per-creature stat block lookups", async () => {
		const result: any = await (getEncounterStatBlocksTool as any).execute(
			{
				campaignId: "campaign-1",
				creatures: [{ name: "Bog lurker" }, { name: "Cult marsh stalker" }],
				limitPerCreature: 2,
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "enc-stats-1", messages: [], env: { DB: {} } } as any
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.totalRequested).toBe(2);
		expect(result.result.data.results[0].matches.length).toBeGreaterThan(0);
		expect(lookupStatBlockExecuteMock).toHaveBeenCalledTimes(2);
	});

	it("scaleEncounterTool easy to deadly increases composition counts", async () => {
		const result: any = await (scaleEncounterTool as any).execute(
			{
				campaignId: "campaign-1",
				targetDifficulty: "deadly",
				partyLevel: 5,
				partySize: 4,
				encounterSpec: {
					encounterSummary: "Easy encounter",
					composition: [
						{
							name: "Bog lurker",
							count: 2,
							threatEstimate: "low",
						},
					],
				},
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "enc-scale-2", messages: [], env: { DB: {} } } as any
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.targetDifficulty).toBe("deadly");
		expect(
			result.result.data.scaledEncounterSpec.composition[0].count
		).toBeGreaterThan(2);
	});

	it("returns 404 when campaign not found", async () => {
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue(
			null
		);

		const result: any = await (generateEncounterTool as any).execute(
			{
				campaignId: "campaign-nonexistent",
				partyLevel: 5,
				partySize: 4,
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "enc-gen-err", messages: [], env: { DB: {} } } as any
		);

		expect(result.result.success).toBe(false);
		expect((result.result.data as { errorCode?: number }).errorCode).toBe(404);
	});
});
