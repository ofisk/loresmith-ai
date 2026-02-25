/**
 * Role-aware context strings injected into agent system messages.
 * Used so all agents tailor behavior for game master vs player.
 */
import type { CampaignRole } from "@/types/campaign";
import { GM_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";

const GM_ROLE_CONTEXT =
  "Tailor for the game master: world-building, session planning, next steps, readiness, and session readout.";

const PLAYER_ROLE_CONTEXT =
  "Tailor your responses for a player. Only share information their character would reasonably know or have experienced in play. Do NOT reveal: future plot, hidden motives, NPC secrets, solutions, treasure locations, tactics, outcomes, or anything not yet revealed in the story. Answer from a player/character perspective and help with session notes and character prep. Never mention spoilers, constraints, or permissions—just deliver helpful content naturally scoped to what the character would know.";

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
    return `User role in this campaign: ${role}. ${PLAYER_ROLE_CONTEXT}`;
  }
  return null;
}
