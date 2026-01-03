/**
 * Shared constants for campaign context and shard entity types
 * Used across conversational context capture and file-based shard extraction
 */

/**
 * All valid entity/context types
 * Combines conversational context types (plot_decision, theme_preference, etc.)
 * and file extraction entity types (monsters, spells, locations, etc.)
 * Note: Cast to mutable array for Zod compatibility
 */
export const ALL_CONTEXT_TYPES = [
  // Conversational/meta context types
  "plot_decision",
  "character_decision",
  "world_building",
  "theme_preference",
  "house_rule",
  "session_note",
  "player_preference",

  // Core entities (things you can drop into play)
  "monsters",
  "npcs",
  "spells",
  "items",
  "traps",
  "hazards",
  "conditions",
  "vehicles",
  "env_effects",

  // Adventure structure (story & flow)
  "hooks",
  "plot_lines",
  "quests",
  "scenes",

  // Locations & world objects
  "locations",
  "lairs",
  "factions",
  "deities",

  // Player-facing mechanics & options
  "backgrounds",
  "feats",
  "subclasses",
  "pcs",
  "rules",
  "downtime",

  // Reference & generators
  "tables",
  "encounter_tables",
  "treasure_tables",

  // Assets & aides
  "maps",
  "handouts",
  "puzzles",

  // Timelines & campaign glue
  "timelines",
  "travel",

  // Flexible catch-all
  "custom",
] as string[] as [string, ...string[]];

/**
 * TypeScript type for all context types
 */
export type ContextType = (typeof ALL_CONTEXT_TYPES)[number];
