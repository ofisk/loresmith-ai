import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import {
	handleCreatePlayerCharacterClaim,
	handleGetPlayerCharacterClaimOptions,
} from "@/routes/campaign-share";

const mockEntityDAO = {
	createEntity: vi.fn(),
	getEntityById: vi.fn(),
	getEntityCountByCampaign: vi.fn(),
	listEntitiesByCampaign: vi.fn(),
};
const mockPlayerCharacterClaimDAO = {
	getClaimForUser: vi.fn(),
	listUnclaimedPcEntities: vi.fn(),
	upsertClaim: vi.fn(),
};
const mockCampaignDAO = {
	getCampaignById: vi.fn(),
	getCampaignRole: vi.fn(),
};
const mockDAOFactory = {
	entityDAO: mockEntityDAO,
	playerCharacterClaimDAO: mockPlayerCharacterClaimDAO,
	campaignDAO: mockCampaignDAO,
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDAOFactory),
}));

vi.mock("@/lib/route-utils", () => ({
	ensureCampaignAccess: vi.fn().mockResolvedValue(true),
	getCampaignRole: vi.fn(),
	getUserAuth: vi.fn(() => ({ username: "player-one" })),
	requireCanEdit: vi.fn(),
	requireParam: vi.fn((c: Context, name: string) => c.req.param(name)),
}));

vi.mock("@/lib/notifications", () => ({
	notifyPartyRosterUpdated: vi.fn(),
	notifyUser: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
	getRequestLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	})),
}));

vi.mock("@/lib/nanoid", () => ({
	nanoid: vi.fn(() => "entity-new"),
}));

const mockContext = {
	req: {
		param: vi.fn(),
		json: vi.fn(),
	},
	env: {
		DB: {} as any,
	},
	json: vi.fn((body: unknown, status?: number) => ({ body, status })),
} as unknown as Context;

describe("player character claim routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockContext.req.param as any).mockReturnValue("campaign-1");
		mockCampaignDAO.getCampaignById.mockResolvedValue({
			id: "campaign-1",
			name: "Test campaign",
			pc_claim_requires_gm_approval: 0,
		});
		mockPlayerCharacterClaimDAO.getClaimForUser.mockResolvedValue(null);
		mockPlayerCharacterClaimDAO.listUnclaimedPcEntities.mockResolvedValue([]);
		mockEntityDAO.getEntityCountByCampaign.mockResolvedValue(0);
	});

	it("returns canCreateNew for editor players without a claim", async () => {
		const { getCampaignRole } = await import("@/lib/route-utils");
		vi.mocked(getCampaignRole).mockResolvedValue(CAMPAIGN_ROLES.EDITOR_PLAYER);

		await handleGetPlayerCharacterClaimOptions(mockContext as any);

		expect(mockContext.json).toHaveBeenCalledWith(
			expect.objectContaining({
				canCreateNew: true,
				requiresCharacterSelection: true,
			})
		);
	});

	it("creates and claims a new PC for editor players", async () => {
		const { getCampaignRole } = await import("@/lib/route-utils");
		vi.mocked(getCampaignRole).mockResolvedValue(CAMPAIGN_ROLES.EDITOR_PLAYER);
		(mockContext.req.json as any).mockResolvedValue({
			createNew: true,
			name: "Astra",
		});
		mockEntityDAO.getEntityById.mockResolvedValue({
			id: "entity-new",
			campaignId: "campaign-1",
			entityType: "pcs",
			name: "Astra",
			content: { summary: "" },
			metadata: {
				pcOnboardingStatus: "incomplete",
				createdByPlayer: "player-one",
			},
		});
		mockPlayerCharacterClaimDAO.getClaimForUser.mockResolvedValueOnce(null);
		mockPlayerCharacterClaimDAO.getClaimForUser.mockResolvedValueOnce({
			campaignId: "campaign-1",
			username: "player-one",
			entityId: "entity-new",
			assignedBy: "player-one",
			claimStatus: "approved",
		});

		await handleCreatePlayerCharacterClaim(mockContext as any);

		expect(mockEntityDAO.createEntity).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Astra",
				metadata: expect.objectContaining({
					pcOnboardingStatus: "incomplete",
					createdByPlayer: "player-one",
				}),
			})
		);
		expect(mockPlayerCharacterClaimDAO.upsertClaim).toHaveBeenCalledWith(
			"campaign-1",
			"player-one",
			expect.any(String),
			"player-one",
			{ claimStatus: "approved" }
		);
		expect(mockContext.json).toHaveBeenCalledWith(
			expect.objectContaining({ success: true, claim: expect.any(Object) })
		);
	});

	it("rejects createNew for readonly players", async () => {
		const { getCampaignRole } = await import("@/lib/route-utils");
		vi.mocked(getCampaignRole).mockResolvedValue(
			CAMPAIGN_ROLES.READONLY_PLAYER
		);
		(mockContext.req.json as any).mockResolvedValue({ createNew: true });

		await handleCreatePlayerCharacterClaim(mockContext as any);

		expect(mockContext.json).toHaveBeenCalledWith(
			{ error: "Only editor players can create a new character" },
			403
		);
	});

	it("creates pending claims when GM approval is required", async () => {
		const { getCampaignRole } = await import("@/lib/route-utils");
		vi.mocked(getCampaignRole).mockResolvedValue(CAMPAIGN_ROLES.EDITOR_PLAYER);
		(mockContext.req.json as any).mockResolvedValue({ createNew: true });
		mockCampaignDAO.getCampaignById.mockResolvedValue({
			id: "campaign-1",
			name: "Test campaign",
			pc_claim_requires_gm_approval: 1,
		});
		mockEntityDAO.getEntityById.mockResolvedValue({
			id: "entity-new",
			campaignId: "campaign-1",
			entityType: "pcs",
			name: "New character",
		});
		mockPlayerCharacterClaimDAO.getClaimForUser.mockResolvedValueOnce(null);
		mockPlayerCharacterClaimDAO.getClaimForUser.mockResolvedValueOnce({
			campaignId: "campaign-1",
			username: "player-one",
			entityId: "entity-new",
			assignedBy: "player-one",
			claimStatus: "pending",
		});

		await handleCreatePlayerCharacterClaim(mockContext as any);

		expect(mockPlayerCharacterClaimDAO.upsertClaim).toHaveBeenCalledWith(
			"campaign-1",
			"player-one",
			expect.any(String),
			"player-one",
			{ claimStatus: "pending" }
		);
	});
});
