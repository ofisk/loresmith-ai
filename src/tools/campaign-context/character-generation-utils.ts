/**
 * Character generation utilities – system-agnostic.
 * No hardcoded game-system data. Rules come from the campaign graph via character-rules-fetcher.
 */

/** Output shape expected from the LLM for character generation. */
export interface GeneratedCharacterData {
	characterName: string;
	characterClass: string;
	characterLevel: number;
	characterRace: string;
	backstory: string;
	personalityTraits: string;
	goals: string;
	relationships: string[];
}

function asString(v: unknown): string {
	if (typeof v === "string") return v.trim();
	if (typeof v === "number") return String(v);
	return "";
}

function asNumber(v: unknown): number {
	if (typeof v === "number" && !Number.isNaN(v))
		return Math.max(1, Math.floor(v));
	if (typeof v === "string") {
		const n = parseInt(v, 10);
		return !Number.isNaN(n) ? Math.max(1, n) : 1;
	}
	return 1;
}

function asStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((item) => typeof item === "string" && item.trim())
		.map((s) => String(s).trim());
}

/**
 * Parse and normalize LLM-generated character JSON.
 * Handles common variations (snake_case, missing fields).
 */
export function parseGeneratedCharacter(raw: unknown): GeneratedCharacterData {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Invalid character data: expected object");
	}
	const o = raw as Record<string, unknown>;
	return {
		characterName: asString(o.characterName ?? o.character_name) || "Unknown",
		characterClass:
			asString(o.characterClass ?? o.character_class) || "Adventurer",
		characterLevel: asNumber(o.characterLevel ?? o.character_level ?? 1),
		characterRace: asString(o.characterRace ?? o.character_race) || "—",
		backstory: asString(o.backstory) || "No backstory provided.",
		personalityTraits:
			asString(o.personalityTraits ?? o.personality_traits) || "Adventurous",
		goals: asString(o.goals) || "Seeks adventure.",
		relationships: asStringArray(o.relationships),
	};
}
