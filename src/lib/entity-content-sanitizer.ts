/**
 * Sanitizes entity content for player roles by stripping spoiler fields.
 * Used when editor_player or readonly_player queries campaign context.
 */

const SPOILER_FIELDS_BY_TYPE: Record<string, string[]> = {
	npc: ["secrets"],
	npcs: ["secrets"],
	faction: ["secrets"],
	factions: ["secrets"],
	map: ["keyed"],
	maps: ["keyed"],
	handout: ["redactions", "when_to_reveal"],
	handouts: ["redactions", "when_to_reveal"],
	puzzle: ["solution", "bypass_methods"],
	puzzles: ["solution", "bypass_methods"],
	trap: ["detect_disarm"],
	traps: ["detect_disarm"],
	scene: ["outcomes", "tactics", "treasure"],
	scenes: ["outcomes", "tactics", "treasure"],
	quest: ["resolutions"],
	quests: ["resolutions"],
	plot_line: ["resolutions"],
	plot_lines: ["resolutions"],
	location: ["treasure", "hazards"],
	locations: ["treasure", "hazards"],
	lair: ["lair_actions", "regional_effects", "treasure"],
	lairs: ["lair_actions", "regional_effects", "treasure"],
	monster: ["tactics"],
	monsters: ["tactics"],
};

/** Fields to strip for unknown entity types (conservative default). */
const DEFAULT_SPOILER_FIELDS = new Set([
	"secrets",
	"solution",
	"solutions",
	"bypass_methods",
	"tactics",
	"outcomes",
	"resolutions",
	"when_to_reveal",
	"redactions",
	"detect_disarm",
	"lair_actions",
	"regional_effects",
]);

/**
 * Strip spoiler fields from entity content for player view.
 * Non-secret information is preserved; only explicitly spoiler fields are removed.
 * For unknown entity types, strips common spoiler field names as a safe default.
 */
export function sanitizeEntityContentForPlayer(
	content: Record<string, unknown>,
	entityType: string
): Record<string, unknown> {
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return content;
	}

	const result = { ...content };
	const fieldsToStrip = SPOILER_FIELDS_BY_TYPE[entityType];

	if (fieldsToStrip && fieldsToStrip.length > 0) {
		for (const field of fieldsToStrip) {
			delete result[field];
		}
	} else {
		// Unknown type: strip any known spoiler-like fields
		for (const key of Object.keys(result)) {
			if (DEFAULT_SPOILER_FIELDS.has(key)) {
				delete result[key];
			}
		}
	}

	// Map special case: strip keyed when no player_version
	const normalizedType = entityType?.toLowerCase() ?? "";
	if (
		(normalizedType === "map" || normalizedType === "maps") &&
		result.player_version !== true &&
		"keyed" in result
	) {
		delete result.keyed;
	}

	return result;
}
