/**
 * Display labels for campaign roles.
 * Used in join flow, share modal, campaign list, and elsewhere.
 */
import type { CampaignRole } from "@/types/campaign";

/** Canonical role string values - use these instead of hardcoded strings */
export const CAMPAIGN_ROLES = {
	OWNER: "owner",
	EDITOR_GM: "editor_gm",
	READONLY_GM: "readonly_gm",
	EDITOR_PLAYER: "editor_player",
	READONLY_PLAYER: "readonly_player",
} as const satisfies Record<string, CampaignRole>;

/** Roles that can only view (cannot edit or capture context) */
export const READONLY_ROLES = new Set<CampaignRole>([
	CAMPAIGN_ROLES.READONLY_GM,
	CAMPAIGN_ROLES.READONLY_PLAYER,
]);

/** Player-level roles (entity content may need sanitization for spoilers) */
export const PLAYER_ROLES = new Set<CampaignRole>([
	CAMPAIGN_ROLES.EDITOR_PLAYER,
	CAMPAIGN_ROLES.READONLY_PLAYER,
]);

/** GM-level roles (owner, editor_gm, readonly_gm) - for tool guards and role context */
export const GM_ROLES = new Set<CampaignRole>([
	CAMPAIGN_ROLES.OWNER,
	CAMPAIGN_ROLES.EDITOR_GM,
	CAMPAIGN_ROLES.READONLY_GM,
]);

/** True if the role is a game master role (owner or any GM). */
export function isGMRole(role: CampaignRole | null): boolean {
	return role !== null && GM_ROLES.has(role);
}

/** Roles that can edit (add resources, approve shards, etc.) */
export const EDIT_ROLES = new Set<CampaignRole>([
	CAMPAIGN_ROLES.OWNER,
	CAMPAIGN_ROLES.EDITOR_GM,
]);

export const CAMPAIGN_ROLE_LABELS: Record<CampaignRole, string> = {
	[CAMPAIGN_ROLES.OWNER]: "Owner",
	[CAMPAIGN_ROLES.EDITOR_GM]: "Co-GM",
	[CAMPAIGN_ROLES.READONLY_GM]: "View-only GM",
	[CAMPAIGN_ROLES.EDITOR_PLAYER]: "Contributing player",
	[CAMPAIGN_ROLES.READONLY_PLAYER]: "View-only player",
};

/** Role options for share link creation (excludes owner) */
export const SHARE_ROLE_OPTIONS = [
	{
		value: CAMPAIGN_ROLES.EDITOR_GM,
		label: CAMPAIGN_ROLE_LABELS[CAMPAIGN_ROLES.EDITOR_GM],
	},
	{
		value: CAMPAIGN_ROLES.READONLY_GM,
		label: CAMPAIGN_ROLE_LABELS[CAMPAIGN_ROLES.READONLY_GM],
	},
	{
		value: CAMPAIGN_ROLES.EDITOR_PLAYER,
		label: CAMPAIGN_ROLE_LABELS[CAMPAIGN_ROLES.EDITOR_PLAYER],
	},
	{
		value: CAMPAIGN_ROLES.READONLY_PLAYER,
		label: CAMPAIGN_ROLE_LABELS[CAMPAIGN_ROLES.READONLY_PLAYER],
	},
] as const;
