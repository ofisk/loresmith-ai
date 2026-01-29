/**
 * Required content fields per entity type for stub approval.
 * Aligned with extraction SPEC: stub shards must have these fields non-empty before approval.
 * Shared by backend (approval validation) and frontend (stub UI).
 */

/**
 * Primary required field(s) per entity type. Stub must have all listed fields non-empty.
 * Single key = one required field; use fallback for types not listed.
 */
const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  location: ["overview"],
  locations: ["overview"],
  npc: ["summary"],
  npcs: ["summary"],
  monster: ["summary"],
  monsters: ["summary"],
  quest: ["objective"],
  quests: ["objective"],
  scene: ["setup"],
  scenes: ["setup"],
  plot_line: ["premise"],
  plot_lines: ["premise"],
  faction: ["purpose"],
  factions: ["purpose"],
  lair: ["owner"],
  lairs: ["owner"],
  hook: ["text"],
  hooks: ["text"],
  spell: ["text"],
  spells: ["text"],
  item: ["text"],
  items: ["text"],
  trap: ["trigger", "effect"],
  traps: ["trigger", "effect"],
  hazard: ["effect"],
  hazards: ["effect"],
  condition: ["effects"],
  conditions: ["effects"],
  vehicle: ["name"],
  vehicles: ["name"],
  env_effect: ["effects"],
  env_effects: ["effects"],
  deity: ["domains"],
  deities: ["domains"],
  background: ["feature"],
  backgrounds: ["feature"],
  feat: ["effect"],
  feats: ["effect"],
  subclass: ["parent_class"],
  subclasses: ["parent_class"],
  pcs: ["summary"],
  rule: ["text"],
  rules: ["text"],
  downtime: ["procedure"],
  table: ["rows"],
  tables: ["rows"],
  encounter_table: ["rows"],
  encounter_tables: ["rows"],
  treasure_table: ["rows"],
  treasure_tables: ["rows"],
  map: ["title"],
  maps: ["title"],
  handout: ["text_or_art_ref"],
  handouts: ["text_or_art_ref"],
  puzzle: ["prompt", "solution"],
  puzzles: ["prompt", "solution"],
  timeline: ["title"],
  timelines: ["title"],
  travel: ["route"],
  custom: ["summary"],
};

/** Fallback: at least one of these must be non-empty for unknown types. */
const FALLBACK_ANY_ONE = ["summary", "overview", "one_line"];

function isNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Returns the list of content keys that must be non-empty for a stub of this entity type to be approvable.
 */
export function getRequiredFieldsForEntityType(entityType: string): string[] {
  const normalized = entityType?.toLowerCase().trim() || "";
  return REQUIRED_FIELDS_BY_TYPE[normalized] ?? FALLBACK_ANY_ONE;
}

/**
 * True when content has all required fields non-empty (for the given entity type).
 * For fallback types, true when at least one of summary/overview/one_line is non-empty.
 */
export function isStubContentSufficient(
  content: unknown,
  entityType: string
): boolean {
  if (content == null) return false;
  if (typeof content !== "object" || Array.isArray(content)) return false;
  const obj = content as Record<string, unknown>;
  const required = getRequiredFieldsForEntityType(entityType);
  const isFallback =
    !REQUIRED_FIELDS_BY_TYPE[entityType?.toLowerCase().trim() ?? ""];
  if (isFallback) {
    return required.some((key) => isNonEmpty(obj[key]));
  }
  return required.every((key) => isNonEmpty(obj[key]));
}
