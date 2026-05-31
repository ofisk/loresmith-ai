import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import type { Entity } from "@/dao/entity-dao";
import {
	getBlockingOnboardingGaps,
	getPcOnboardingGaps,
	getPcOnboardingStatus,
	isPcOnboardingIncomplete,
	markPcOnboardingComplete,
	PC_ONBOARDING_STATUS,
	parsePcEntityContent,
	parsePcEntityMetadata,
} from "@/lib/player-character-onboarding";
import { getAgentRoleContext } from "@/lib/prompts/agent-role-context";

const mockEntityDAO = {
	getEntityById: vi.fn(),
	getEntityCountByCampaign: vi.fn(),
	listEntitiesByCampaign: vi.fn(),
	updateEntity: vi.fn(),
};
const mockEntityGraphService = {
	getNeighbors: vi.fn(),
};
const mockDAOFactory = {
	entityDAO: mockEntityDAO,
	entityGraphService: mockEntityGraphService,
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDAOFactory),
}));

vi.mock("@/tools/campaign/planning-tools-utils", () => ({
	analyzePlayerCharacterCompleteness: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity> = {}): Entity {
	return {
		id: "pc-1",
		campaignId: "campaign-1",
		entityType: "pcs",
		name: "New character",
		content: {},
		metadata: {},
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("player-character-onboarding", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEntityDAO.getEntityCountByCampaign.mockResolvedValue(0);
		mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([]);
		mockEntityGraphService.getNeighbors.mockResolvedValue([]);
	});

	it("detects incomplete status from metadata", () => {
		const entity = makeEntity({
			metadata: { pcOnboardingStatus: PC_ONBOARDING_STATUS.INCOMPLETE },
		});
		expect(getPcOnboardingStatus(entity)).toBe(PC_ONBOARDING_STATUS.INCOMPLETE);
		expect(isPcOnboardingIncomplete(entity)).toBe(true);
	});

	it("returns null onboarding status for missing entity", () => {
		expect(getPcOnboardingStatus(null)).toBeNull();
		expect(isPcOnboardingIncomplete(null)).toBe(false);
	});

	it("treats player-created stubs without backstory as incomplete", () => {
		const entity = makeEntity({
			metadata: { createdByPlayer: "player-one" },
			content: { summary: "" },
		});
		expect(isPcOnboardingIncomplete(entity)).toBe(true);
	});

	it("treats completed sheets as not incomplete", () => {
		const entity = makeEntity({
			metadata: { pcOnboardingStatus: PC_ONBOARDING_STATUS.COMPLETE },
			content: { backstory: "A full backstory" },
		});
		expect(isPcOnboardingIncomplete(entity)).toBe(false);
	});

	it("does not treat placeholder names as incomplete without createdByPlayer", () => {
		const entity = makeEntity({
			name: "New character",
			content: { backstory: "Ready to play" },
		});
		expect(isPcOnboardingIncomplete(entity)).toBe(false);
	});

	it("parses string metadata and content records", () => {
		const entity = makeEntity({
			content: JSON.stringify({ summary: "Hello" }),
			metadata: JSON.stringify({ pcOnboardingStatus: "incomplete" }),
		});
		expect(parsePcEntityContent(entity)).toEqual({ summary: "Hello" });
		expect(parsePcEntityMetadata(entity)).toEqual({
			pcOnboardingStatus: "incomplete",
		});
	});

	it("treats plain string entity content as backstory", () => {
		const entity = makeEntity({
			content: "A wandering bard",
		});
		expect(parsePcEntityContent(entity)).toEqual({
			backstory: "A wandering bard",
		});
	});

	it("filters blocking onboarding gaps to critical and important only", () => {
		const blocking = getBlockingOnboardingGaps([
			{
				type: "a",
				severity: "critical",
				description: "critical",
				suggestion: "fix",
				category: "well-formed",
			},
			{
				type: "b",
				severity: "minor",
				description: "minor",
				suggestion: "optional",
				category: "well-formed",
			},
		]);
		expect(blocking).toHaveLength(1);
		expect(blocking[0]?.type).toBe("a");
	});

	it("aggregates completeness and player-facing gaps", async () => {
		const { analyzePlayerCharacterCompleteness } = await import(
			"@/tools/campaign/planning-tools-utils"
		);
		vi.mocked(analyzePlayerCharacterCompleteness).mockResolvedValue([
			{
				type: "character_relationships_pc-1",
				severity: "important",
				description: "No graph ties",
				suggestion: "Connect to the world",
			},
		]);
		mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([
			makeEntity({ id: "pc-2", name: "Borin" }),
		]);

		const entity = makeEntity();
		const gaps = await getPcOnboardingGaps(entity, "campaign-1", { DB: {} });

		expect(
			gaps.some((gap) => gap.type === "character_relationships_pc-1")
		).toBe(true);
		expect(gaps.some((gap) => gap.category === "well-connected")).toBe(true);
		expect(gaps.some((gap) => gap.type === `pc_name_${entity.id}`)).toBe(true);
		expect(gaps.some((gap) => gap.type === `pc_party_tie_${entity.id}`)).toBe(
			true
		);
	});

	it("skips spell and party gaps when not applicable", async () => {
		const { analyzePlayerCharacterCompleteness } = await import(
			"@/tools/campaign/planning-tools-utils"
		);
		vi.mocked(analyzePlayerCharacterCompleteness).mockResolvedValue([]);
		mockEntityDAO.getEntityCountByCampaign.mockResolvedValue(3);
		mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([
			makeEntity({
				id: "pc-2",
				name: "Borin",
				content: {},
			}),
		]);

		const entity = makeEntity({
			name: "Astra",
			content: {
				characterClass: "Fighter",
				characterRace: "Human",
				characterLevel: 3,
				attributes: { str: 16 },
				inventory: ["sword"],
				spells: ["shield"],
				relationships: ["Old friend of Borin"],
			},
		});

		const gaps = await getPcOnboardingGaps(entity, "campaign-1", { DB: {} });

		expect(gaps.some((gap) => gap.type === `pc_spells_${entity.id}`)).toBe(
			false
		);
		expect(gaps.some((gap) => gap.type === `pc_party_tie_${entity.id}`)).toBe(
			false
		);
	});

	it("uses graph neighbors to satisfy party tie requirement", async () => {
		const { analyzePlayerCharacterCompleteness } = await import(
			"@/tools/campaign/planning-tools-utils"
		);
		vi.mocked(analyzePlayerCharacterCompleteness).mockResolvedValue([]);
		mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([
			makeEntity({ id: "pc-2", name: "Borin" }),
		]);
		mockEntityGraphService.getNeighbors.mockResolvedValue([
			{
				entityId: "pc-2",
				entityType: "pcs",
				name: "Borin",
				depth: 1,
				relationshipType: "ally",
			},
		]);

		const entity = makeEntity({ name: "Astra" });
		const gaps = await getPcOnboardingGaps(entity, "campaign-1", { DB: {} });

		expect(gaps.some((gap) => gap.type === `pc_party_tie_${entity.id}`)).toBe(
			false
		);
	});

	it("marks onboarding complete when blocking gaps are cleared", async () => {
		const { analyzePlayerCharacterCompleteness } = await import(
			"@/tools/campaign/planning-tools-utils"
		);
		vi.mocked(analyzePlayerCharacterCompleteness).mockResolvedValue([]);
		const entity = makeEntity({
			name: "Astra",
			content: {
				characterClass: "Fighter",
				characterRace: "Human",
				characterLevel: 3,
				attributes: { str: 16 },
				inventory: ["sword"],
				relationships: ["Partner of Borin"],
			},
		});
		mockEntityDAO.getEntityById.mockResolvedValue(entity);
		mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([
			makeEntity({ id: "pc-2", name: "Borin" }),
		]);

		const result = await markPcOnboardingComplete("pc-1", { DB: {} });

		expect(result.success).toBe(true);
		expect(mockEntityDAO.updateEntity).toHaveBeenCalledWith(
			"pc-1",
			expect.objectContaining({
				metadata: expect.objectContaining({
					pcOnboardingStatus: PC_ONBOARDING_STATUS.COMPLETE,
				}),
			})
		);
	});

	it("returns remaining gaps when onboarding is not ready", async () => {
		const { analyzePlayerCharacterCompleteness } = await import(
			"@/tools/campaign/planning-tools-utils"
		);
		vi.mocked(analyzePlayerCharacterCompleteness).mockResolvedValue([]);
		const entity = makeEntity();
		mockEntityDAO.getEntityById.mockResolvedValue(entity);

		const result = await markPcOnboardingComplete("pc-1", { DB: {} });

		expect(result.success).toBe(false);
		expect(result.remainingGaps?.length).toBeGreaterThan(0);
		expect(mockEntityDAO.updateEntity).not.toHaveBeenCalled();
	});

	it("throws when entity is missing during completion", async () => {
		mockEntityDAO.getEntityById.mockResolvedValue(null);
		await expect(
			markPcOnboardingComplete("missing", { DB: {} })
		).rejects.toThrow("Entity not found");
	});
});

describe("agent role context for incomplete player characters", () => {
	it("includes onboarding guidance for incomplete claimed PCs", () => {
		const entity = makeEntity({
			name: "Astra",
			metadata: { pcOnboardingStatus: PC_ONBOARDING_STATUS.INCOMPLETE },
		});
		const context = getAgentRoleContext({
			username: "player-one",
			role: CAMPAIGN_ROLES.EDITOR_PLAYER,
			claim: {
				campaignId: "campaign-1",
				username: "player-one",
				entityId: entity.id,
				assignedBy: "player-one",
				claimStatus: "approved",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
			},
			entity,
			hasAnyPcEntities: true,
			isPcOnboardingIncomplete: true,
			onboardingGaps: [
				{
					type: "pc_class_pc-1",
					severity: "important",
					description: "Missing class",
					suggestion: "Pick a class",
					category: "well-formed",
				},
			],
		});

		expect(context).toContain("incomplete");
		expect(context).toContain("completePlayerCharacterOnboarding");
		expect(context).toContain("Missing class");
	});
});
