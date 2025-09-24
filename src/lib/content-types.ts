/**
 * Structured content types for RPG/D&D content extraction
 * These define the types of "primitives" that can be extracted from documents
 * and used in campaign management and AI agent interactions.
 */

export const STRUCTURED_CONTENT_TYPES = [
  // Core entities (things you can drop into play)
  "monsters", // Monster stat blocks with CR, abilities, actions, etc.
  "npcs", // Non-statblock characters with roles, goals, relationships
  "spells", // Spell descriptions with level, school, casting time, etc.
  "items", // Magic items, artifacts, consumables with rarity, properties
  "traps", // Traps and hazards with triggers, effects, DCs
  "hazards", // Environmental hazards and dangers
  "conditions", // Diseases, curses, status effects
  "vehicles", // Ships, mounts, vehicles with stats and crew
  "env_effects", // Weather, regional effects, lair actions

  // Adventure structure (story & flow)
  "hooks", // Plot hooks and adventure starters
  "plot_lines", // Major plot arcs and storylines
  "quests", // Quests and side quests with objectives
  "scenes", // Structured encounters and scenes

  // Locations & world objects
  "locations", // Rooms, buildings, dungeons, regions, cities
  "lairs", // Monster lairs with special features
  "factions", // Organizations and groups
  "deities", // Gods, patrons, divine powers

  // Player-facing mechanics & options
  "backgrounds", // Character backgrounds
  "feats", // Character feats and abilities
  "subclasses", // Class options and subclasses
  "characters", // Player or NPC character sheets
  "character_sheets", // Structured character sheet representations
  "rules", // Variant and optional rules
  "downtime", // Downtime activities and crafting

  // Reference & generators
  "tables", // Random tables for various content
  "encounter_tables", // Encounter generation tables
  "treasure_tables", // Treasure and loot tables

  // Assets & aides
  "maps", // Maps and cartography
  "handouts", // Player handouts and props
  "puzzles", // Riddles and puzzles

  // Timelines & campaign glue
  "timelines", // Campaign timelines and clocks
  "travel", // Travel routes and journeys

  // Flexible discovery
  "custom", // Custom content types discovered during extraction
] as const;

export type StructuredContentType = (typeof STRUCTURED_CONTENT_TYPES)[number];

/**
 * Shard status constants
 */
export const SHARD_STATUSES = {
  STAGED: "staged",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ShardStatus = (typeof SHARD_STATUSES)[keyof typeof SHARD_STATUSES];

/**
 * Helper function to check if a string is a valid content type
 */
export function isValidContentType(
  type: string
): type is StructuredContentType {
  return STRUCTURED_CONTENT_TYPES.includes(type as StructuredContentType);
}

/**
 * Get a human-readable name for a content type
 */
export function getContentTypeDisplayName(type: StructuredContentType): string {
  const displayNames: Record<StructuredContentType, string> = {
    monsters: "Monsters",
    npcs: "NPCs",
    spells: "Spells",
    items: "Magic Items",
    traps: "Traps",
    hazards: "Hazards",
    conditions: "Conditions",
    vehicles: "Vehicles",
    env_effects: "Environmental Effects",
    hooks: "Plot Hooks",
    plot_lines: "Plot Lines",
    quests: "Quests",
    scenes: "Scenes",
    locations: "Locations",
    lairs: "Lairs",
    factions: "Factions",
    deities: "Deities",
    backgrounds: "Backgrounds",
    feats: "Feats",
    subclasses: "Subclasses",
    characters: "Characters",
    character_sheets: "Character Sheets",
    rules: "Rules",
    downtime: "Downtime Activities",
    tables: "Tables",
    encounter_tables: "Encounter Tables",
    treasure_tables: "Treasure Tables",
    maps: "Maps",
    handouts: "Handouts",
    puzzles: "Puzzles",
    timelines: "Timelines",
    travel: "Travel Routes",
    custom: "Custom Content",
  };

  return displayNames[type];
}
