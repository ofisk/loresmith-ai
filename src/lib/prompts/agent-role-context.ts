/**
 * Role-aware context strings injected into agent system messages.
 * Used so all agents tailor behavior for game master vs player.
 */

import {
	CAMPAIGN_ROLES,
	GM_ROLES,
	PLAYER_ROLES,
} from "@/constants/campaign-roles";
import type { ResolvedClaimedPlayerContext } from "@/lib/agent-role-utils";
import {
	buildPlayerCharacterOnboardingGapPrompts,
	buildPlayerCharacterOnboardingOpeningPrompt,
} from "@/lib/prompts/player-character-onboarding-prompts";

const GM_ROLE_CONTEXT =
	"Tailor for the game master: world-building, session planning, next steps, readiness, and session readout.";

const PLAYER_BASE_CONTEXT =
	"Tailor your responses for a player. Only share information their character would reasonably know or have experienced in play. Do NOT reveal: future plot, hidden motives, NPC secrets, solutions, treasure locations, tactics, outcomes, or anything not yet revealed in the story. Answer from a player/character perspective. Never mention spoilers, constraints, or permissions—just deliver helpful content naturally scoped to what the character would know.";

const PLAYER_CANNOT_EDIT =
	"This player cannot create or edit characters, shards, world state, or campaign content. Only suggest things they can do: session notes, in-character prep, roleplay support, and questions they might ask the GM—never world-building, character creation, or modifying the campaign.";

/**
 * Returns the role context string to inject as a system message for the given campaign role.
 * Used in BaseAgent after resolving role from campaignId + username.
 */
export function getAgentRoleContext(
	playerContext: ResolvedClaimedPlayerContext | null
): string | null {
	const role = playerContext?.role ?? null;
	if (role === null) return null;
	if (GM_ROLES.has(role)) {
		return `User role in this campaign: ${role}. ${GM_ROLE_CONTEXT}`;
	}
	if (PLAYER_ROLES.has(role)) {
		const cannotEdit =
			role === CAMPAIGN_ROLES.READONLY_PLAYER ? ` ${PLAYER_CANNOT_EDIT}` : "";
		const claimedEntity = playerContext?.entity;
		if (claimedEntity && playerContext.isPcOnboardingIncomplete) {
			const pendingNote =
				playerContext.claim?.claimStatus === "pending"
					? " Their claim is pending GM approval, but they can still build the sheet while waiting."
					: "";
			const gapPrompt = buildPlayerCharacterOnboardingGapPrompts(
				playerContext.onboardingGaps ?? []
			);
			return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} Claimed player character: ${claimedEntity.name} (entity ID: ${claimedEntity.id}, type: ${claimedEntity.entityType}). This sheet is incomplete.${pendingNote} ${buildPlayerCharacterOnboardingOpeningPrompt(claimedEntity, playerContext.claim)} ${gapPrompt}`;
		}
		if (!claimedEntity) {
			const hasAnyPcEntities = playerContext?.hasAnyPcEntities ?? false;
			if (!hasAnyPcEntities && role === CAMPAIGN_ROLES.EDITOR_PLAYER) {
				return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} This campaign does not have any player characters yet. Help them create their first character for the campaign before proceeding with character-specific guidance. They can choose "Create new" from the character claim panel if no prebuilt PCs exist.`;
			}
			if (role === CAMPAIGN_ROLES.READONLY_PLAYER) {
				if (!hasAnyPcEntities) {
					return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} This campaign does not have any player characters yet. Continue helping with general, non-spoiler world and source questions. If character-specific perspective is needed, ask the user to have a GM create and assign a player character first.`;
				}
				return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} This player has not selected a character yet. Continue helping with general, non-spoiler tabletop and campaign questions. If character-specific perspective is needed, ask them to choose their character in campaign details first.`;
			}
			return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} This player has not selected a character yet. Before any campaign-specific generation, ask them to select their character first and avoid campaign-specific generation until they do. Tell them: "Choose your character before continuing. Open campaign details and select your character, or create a new one if available."`;
		}

		return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit} Claimed player character: ${claimedEntity.name} (entity ID: ${claimedEntity.id}, type: ${claimedEntity.entityType}). Personalize responses from this character's perspective and use only details this specific character would reasonably know.`;
	}
	return null;
}
