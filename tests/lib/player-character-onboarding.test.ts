import { describe, expect, it } from "vitest";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import type { Entity } from "@/dao/entity-dao";
import {
	getBlockingOnboardingGaps,
	getPcOnboardingStatus,
	isPcOnboardingIncomplete,
	PC_ONBOARDING_STATUS,
	parsePcEntityContent,
	parsePcEntityMetadata,
} from "@/lib/player-character-onboarding";
import { getAgentRoleContext } from "@/lib/prompts/agent-role-context";

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
	it("detects incomplete status from metadata", () => {
		const entity = makeEntity({
			metadata: { pcOnboardingStatus: PC_ONBOARDING_STATUS.INCOMPLETE },
		});
		expect(getPcOnboardingStatus(entity)).toBe(PC_ONBOARDING_STATUS.INCOMPLETE);
		expect(isPcOnboardingIncomplete(entity)).toBe(true);
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
