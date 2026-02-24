/**
 * Sanitizes entity content for player roles by stripping spoiler fields.
 * Used when editor_player or readonly_player queries campaign context.
 */

const SPOILER_FIELDS_BY_TYPE: Record<string, string[]> = {
  npc: ["secrets"],
  faction: ["secrets"],
  map: ["keyed"], // Strip keyed areas when no player_version; we strip always for simplicity
  handout: ["redactions", "when_to_reveal"], // Strip redaction metadata; when_to_reveal handled when session-aware
  puzzle: ["solution", "bypass_methods"],
  trap: ["detect_disarm"],
  scene: ["outcomes", "tactics", "treasure"],
  quest: ["resolutions"],
  plot_line: ["resolutions"],
  location: ["treasure", "hazards"],
  lair: ["lair_actions", "regional_effects", "treasure"],
  monster: [], // Keep stats for combat; optionally add "tactics" if present
};

/**
 * Strip spoiler fields from entity content for player view.
 * Non-secret information is preserved; only explicitly spoiler fields are removed.
 */
export function sanitizeEntityContentForPlayer(
  content: Record<string, unknown>,
  entityType: string
): Record<string, unknown> {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return content;
  }

  const fieldsToStrip = SPOILER_FIELDS_BY_TYPE[entityType];
  if (!fieldsToStrip || fieldsToStrip.length === 0) {
    // For map: if player_version exists, we could keep more - for now strip keyed if present
    if (entityType === "map" && content.player_version !== true) {
      const { keyed, ...rest } = content;
      return rest;
    }
    return { ...content };
  }

  const result = { ...content };
  for (const field of fieldsToStrip) {
    delete result[field];
  }

  // Map special case: strip keyed when no player_version
  if (
    entityType === "map" &&
    result.player_version !== true &&
    "keyed" in result
  ) {
    delete result.keyed;
  }

  return result;
}
