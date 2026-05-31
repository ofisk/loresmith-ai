import type { Entity } from "@/dao/entity-dao";
import type { PlayerCharacterClaim } from "@/dao/player-character-claim-dao";
import type { PlayerPcOnboardingGap } from "@/lib/player-character-onboarding";

export function buildPlayerCharacterOnboardingOpeningPrompt(
	entity: Entity,
	claim: PlayerCharacterClaim | null
): string {
	const pendingNote =
		claim?.claimStatus === "pending"
			? " Their claim is pending GM approval, but they can still build out the sheet while waiting."
			: "";

	return `The player just returned with an incomplete player character sheet for "${entity.name}" (entity ID: ${entity.id}).${pendingNote} Open with a warm, structured onboarding interview. Work through missing details in small steps: name and concept, backstory, motivations and goals, class/species/level and stats, gear and spells if relevant, then ties to the campaign world and at least one other PC. Prefer generateCharacterWithAITool for a strong first draft, then refine with updateCharacterInfo. When the sheet is well-formed and well-connected, call completePlayerCharacterOnboarding.`;
}

export function buildPlayerCharacterOnboardingGapPrompts(
	gaps: PlayerPcOnboardingGap[]
): string {
	if (gaps.length === 0) {
		return "The character sheet has no remaining onboarding gaps. Confirm with the player, then call completePlayerCharacterOnboarding.";
	}

	const lines = gaps.slice(0, 8).map((gap) => {
		return `- [${gap.category}/${gap.severity}] ${gap.description} → ${gap.suggestion}`;
	});

	return `Remaining onboarding gaps to address:\n${lines.join("\n")}`;
}

export function buildPlayerCharacterOnboardingAgentGuidelines(
	entity: Entity
): string {
	return `## Player character onboarding (active)

You are helping the player finish their claimed character "${entity.name}" (entity ID: ${entity.id}).

Rules:
- Only update this claimed entity. Do not create or edit other PCs.
- Prefer generateCharacterWithAITool for a rich first draft, then updateCharacterInfo to refine fields.
- After each major update, re-check gaps mentally and keep guiding until the sheet is complete.
- Connect the PC to campaign locations, factions, NPCs, and at least one other party member when possible.
- When critical and important gaps are cleared, call completePlayerCharacterOnboarding for entity ID ${entity.id}.`;
}
