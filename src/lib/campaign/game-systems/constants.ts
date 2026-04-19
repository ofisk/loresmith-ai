/**
 * Campaign-level `game_system` is a **freeform label** (homebrew, indie RPGs, etc.).
 * It is sanitized for storage only; unknown values are **not** coerced to `generic`.
 *
 * `SUGGESTED_GAME_SYSTEMS` is for UI presets / docs only — not validation.
 */
export const DEFAULT_GAME_SYSTEM = "generic";

/** Optional UI presets; campaigns may use any string within {@link MAX_GAME_SYSTEM_LENGTH}. */
export const SUGGESTED_GAME_SYSTEMS = ["generic", "dnd5e"] as const;

export type SuggestedGameSystemId = (typeof SUGGESTED_GAME_SYSTEMS)[number];

const MAX_GAME_SYSTEM_LENGTH = 80;

/** @deprecated Use {@link SuggestedGameSystemId} */
export type GameSystemId = SuggestedGameSystemId;

/** @deprecated Use {@link SUGGESTED_GAME_SYSTEMS} */
export const SUPPORTED_GAME_SYSTEMS = SUGGESTED_GAME_SYSTEMS;

export function isSuggestedGameSystemId(
	value: string
): value is SuggestedGameSystemId {
	return (SUGGESTED_GAME_SYSTEMS as readonly string[]).includes(value);
}

/** @deprecated Use {@link isSuggestedGameSystemId} */
export function isSupportedGameSystemId(value: string): value is GameSystemId {
	return isSuggestedGameSystemId(value);
}

/**
 * Trim, strip control characters, clamp length. Empty → {@link DEFAULT_GAME_SYSTEM}.
 * Does **not** replace unknown game names with `generic`.
 */
export function sanitizeCampaignGameSystemId(
	value: string | undefined | null
): string {
	if (value == null || typeof value !== "string") {
		return DEFAULT_GAME_SYSTEM;
	}
	let v = value.trim().replace(/\s+/g, " ");
	v = [...v]
		.filter((ch) => {
			const c = ch.codePointAt(0) ?? 0;
			return c >= 0x20 && c !== 0x7f;
		})
		.join("");
	if (!v) {
		return DEFAULT_GAME_SYSTEM;
	}
	if (v.length > MAX_GAME_SYSTEM_LENGTH) {
		v = v.slice(0, MAX_GAME_SYSTEM_LENGTH);
	}
	return v;
}

/** @deprecated Use {@link sanitizeCampaignGameSystemId} */
export const normalizeGameSystemId = sanitizeCampaignGameSystemId;
