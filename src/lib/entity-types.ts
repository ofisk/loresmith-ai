/**
 * Structured entity types for tabletop game content extraction.
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
  "pcs", // Player characters (PCs) with backstories and character data
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
 * Entity types grouped by category for prompt generation and organization
 */
export const ENTITY_TYPE_CATEGORIES = {
  "Core entities": [
    "monsters",
    "npcs",
    "spells",
    "items",
    "traps",
    "hazards",
    "conditions",
    "vehicles",
    "env_effects",
  ],
  "Adventure structure": ["hooks", "plot_lines", "quests", "scenes"],
  "Locations & world": ["locations", "lairs", "factions", "deities"],
  "Player mechanics": [
    "backgrounds",
    "feats",
    "subclasses",
    "pcs",
    "rules",
    "downtime",
  ],
  "Reference & generators": ["tables", "encounter_tables", "treasure_tables"],
  Assets: ["maps", "handouts", "puzzles"],
  "Campaign glue": ["timelines", "travel"],
  Custom: ["custom"],
} as const;

/**
 * Helper function to check if a string is a valid entity type.
 */
export function isValidEntityType(type: string): type is StructuredEntityType {
  return STRUCTURED_ENTITY_TYPES.includes(type as StructuredEntityType);
}

/** Common singular/abbreviation -> canonical type from STRUCTURED_ENTITY_TYPES */
const ENTITY_TYPE_ALIASES: Record<string, StructuredEntityType> = {
  npc: "npcs",
  pc: "pcs",
  monster: "monsters",
  spell: "spells",
  item: "items",
  trap: "traps",
  hazard: "hazards",
  condition: "conditions",
  vehicle: "vehicles",
  env_effect: "env_effects",
  hook: "hooks",
  plot_line: "plot_lines",
  quest: "quests",
  scene: "scenes",
  location: "locations",
  lair: "lairs",
  faction: "factions",
  deity: "deities",
  background: "backgrounds",
  feat: "feats",
  subclass: "subclasses",
  table: "tables",
  encounter_table: "encounter_tables",
  treasure_table: "treasure_tables",
  map: "maps",
  handout: "handouts",
  puzzle: "puzzles",
  timeline: "timelines",
  travel: "travel",
};

/**
 * Normalize an entity type string to the canonical form from STRUCTURED_ENTITY_TYPES.
 * Ensures only one valid form exists (e.g. "npc" and "NPC" both become "npcs").
 */
export function normalizeEntityType(type: string): StructuredEntityType {
  const t = (type ?? "").trim().toLowerCase();
  if (!t) return "custom";
  const exact = STRUCTURED_ENTITY_TYPES.find((c) => c === t);
  if (exact) return exact;
  const alias = ENTITY_TYPE_ALIASES[t];
  if (alias) return alias;
  return "custom";
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
    pcs: "Player Characters",
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

/**
 * Entity types that are especially relevant for campaign readiness
 * analysis and graph connectivity checks (NPCs, factions, locations, hooks, etc.).
 * Centralizing this list here ensures new types can be added in one place.
 */
export const CAMPAIGN_READINESS_ENTITY_TYPES: StructuredEntityType[] = [
  "npcs",
  "pcs",
  "factions",
  "locations",
  "lairs",
  "hooks",
  "quests",
  "plot_lines",
  "scenes",
] as const;

/**
 * Readiness buckets for grouping entity types into higher-level concepts.
 * These are used for campaign readiness guidance (e.g., \"NPC-like\", \"location-like\").
 */
export const READINESS_ENTITY_BUCKETS = {
  npcLike: ["npcs"],
  pcLike: ["pcs"],
  factionLike: ["factions"],
  locationLike: ["locations", "lairs", "scenes"],
  hookLike: ["hooks", "quests", "plot_lines", "scenes"],
} satisfies Record<string, StructuredEntityType[]>;

/**
 * Extraction hints for each entity type to guide the LLM in identifying content.
 * These hints describe common patterns, keywords, and structures to look for.
 */
export const ENTITY_TYPE_EXTRACTION_HINTS: Partial<
  Record<StructuredEntityType, string>
> = {
  monsters:
    '"Armor Class", "Hit Points", STR/DEX/CON/INT/WIS/CHA line, "Challenge"',
  spells:
    '"1st-level <school>", casting time, range, components, duration, "At Higher Levels"',
  items: 'rarity, type, "requires attunement"',
  traps: "Trigger/Effect/DCs/Countermeasures",
  hazards: "Trigger/Effect/DCs/Countermeasures",
  locations:
    'numbered lists of places (e.g., "1. [Location Name]", "2. [Another Location]"), named areas within cities/dungeons, districts, rooms, chambers, halls, neighborhoods, quarters, wards, sections, landmarks, geographic features. Extract sub-locations (numbered items, keyed areas, rooms within dungeons, locations within cities, districts within regions) as SEPARATE location entities with "located_in" relationships to parent locations.',
  scenes: 'numbered keys (e.g., "Area 12"), read-aloud boxed text, GM notes',
  hooks: "imperative requests with stakes and links to NPCs/locations",
  quests: "imperative requests with stakes and links to NPCs/locations",
  tables: "a dice column (d20/d100), range → result rows",
  encounter_tables: "a dice column (d20/d100), range → result rows",
  treasure_tables: "a dice column (d20/d100), range → result rows",
};
