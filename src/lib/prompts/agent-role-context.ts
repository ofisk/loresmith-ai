/**
 * Role-aware context strings injected into agent system messages.
 * Used so all agents tailor behavior for game master vs player.
 */
import type { CampaignRole } from "@/types/campaign";
import { GM_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";

const GM_ROLE_CONTEXT =
  "Tailor for the game master: world-building, session planning, next steps, readiness, and session readout.";

const PLAYER_ROLE_CONTEXT =
  "Tailor your responses for a player: (1) Answer questions from a player/character perspective when relevant. (2) Help develop well-rounded, well-integrated characters in the world. (3) Help review session notes while avoiding spoilers—do not reveal GM-only content (future plot, NPC secrets, solutions, tactics). (4) You are providing a player lens on the same campaign; do not expose planning tasks, session scripts, or world-state changelog in a GM form.";

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
