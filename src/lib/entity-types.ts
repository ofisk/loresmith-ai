/**
 * Structured entity types for RPG/D&D content extraction.
 * These define the categories of "primitives" that can be extracted from documents
 * and used in campaign management and AI agent interactions.
 */

export const STRUCTURED_ENTITY_TYPES = [
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

export type StructuredEntityType = (typeof STRUCTURED_ENTITY_TYPES)[number];

/**
 * Helper function to check if a string is a valid entity type.
 */
export function isValidEntityType(type: string): type is StructuredEntityType {
  return STRUCTURED_ENTITY_TYPES.includes(type as StructuredEntityType);
}

/**
 * Get a human-readable name for an entity type.
 */
export function getEntityTypeDisplayName(type: StructuredEntityType): string {
  const displayNames: Record<StructuredEntityType, string> = {
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
