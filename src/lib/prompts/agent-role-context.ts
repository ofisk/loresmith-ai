/**
 * Role-aware context strings injected into agent system messages.
 * Used so all agents tailor behavior for game master vs player.
 */

import {
	CAMPAIGN_ROLES,
	GM_ROLES,
	PLAYER_ROLES,
} from "@/constants/campaign-roles";
import type { CampaignRole } from "@/types/campaign";

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
export function getAgentRoleContext(role: CampaignRole | null): string | null {
	if (role === null) return null;
	if (GM_ROLES.has(role)) {
		return `User role in this campaign: ${role}. ${GM_ROLE_CONTEXT}`;
	}
	if (PLAYER_ROLES.has(role)) {
		const cannotEdit =
			role === CAMPAIGN_ROLES.READONLY_PLAYER ? ` ${PLAYER_CANNOT_EDIT}` : "";
		return `User role in this campaign: ${role}. ${PLAYER_BASE_CONTEXT}${cannotEdit}`;
	}
	return null;
}
