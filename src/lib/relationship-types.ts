export const RELATIONSHIP_TYPES = [
  "member_of",
  "ruled_by",
  "sacred_to",
  "located_in",
  "owns",
  "allied_with",
  "enemy_of",
  "related_to",
  "resides_in",
  "guards",
  "controls",
  "connected_to",
  "adjacent_to",
  "quest_giver",
  "quest_target",
  "quest_requires",
  "owned_by",
  "wielded_by",
  "crafted_by",
  "blessed_by",
  "worships",
  "champion_of",
  "parent_of",
  "mentor_of",
  "rival_of",
  "married_to",
  "owes_debt_to",
  "appears_in",
  "featured_in",
  "related_rule",
  "grants_feat",
  "unlocks_subclass",
  "spawns",
  "summons",
  "transforms_into",
  "preceded_by",
  "followed_by",
  "occurs_after",
  "depicts",
  "references",
  "reveals",
  "unlocks_content",
  "generates",
  "contains_entry",
  "represents",
  "documented_by",
  "includes_event",
  "route_to",
  "occurs_at",
  "grants_proficiency",
  "enables_activity",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

const BIDIRECTIONAL_RELATIONSHIPS: RelationshipType[] = [
  "allied_with",
  "enemy_of",
  "related_to",
  "connected_to",
  "adjacent_to",
  "rival_of",
  "married_to",
];

const RELATIONSHIP_SYNONYMS: Record<string, RelationshipType> = {
  member: "member_of",
  belongs_to: "member_of",
  part_of: "member_of",
  ruledby: "ruled_by",
  leads: "ruled_by",
  sacred: "sacred_to",
  location: "located_in",
  located: "located_in",
  owns: "owns",
  owner_of: "owns",
  ally: "allied_with",
  allies_with: "allied_with",
  allied: "allied_with",
  enemy: "enemy_of",
  enemies_with: "enemy_of",
  opposed_to: "enemy_of",
  related: "related_to",
  relation: "related_to",
  resides: "resides_in",
  lives_in: "resides_in",
  stationed_at: "resides_in",
  guarding: "guards",
  protect: "guards",
  protecting: "guards",
  patrols: "guards",
  control: "controls",
  controls: "controls",
  governs: "controls",
  connected: "connected_to",
  linked_to: "connected_to",
  links_to: "connected_to",
  adjacency: "adjacent_to",
  neighboring: "adjacent_to",
  neighbor_to: "adjacent_to",
  questgiver: "quest_giver",
  issued_by: "quest_giver",
  gives_quest_to: "quest_giver",
  questtarget: "quest_target",
  objective: "quest_target",
  quest_objective: "quest_target",
  required_for_quest: "quest_requires",
  quest_requirement: "quest_requires",
  prerequisite: "quest_requires",
  owns_by: "owned_by",
  ownedby: "owned_by",
  possessed_by: "owned_by",
  bearer: "owned_by",
  wielded: "wielded_by",
  wieldedby: "wielded_by",
  carried_by: "wielded_by",
  craftedby: "crafted_by",
  forged_by: "crafted_by",
  created_by: "crafted_by",
  blessedby: "blessed_by",
  consecrated_by: "blessed_by",
  sanctified_by: "blessed_by",
  worshipped_by: "worships",
  worshippedby: "worships",
  followers: "worships",
  championed_by: "champion_of",
  champions: "champion_of",
  patron_of: "champion_of",
  parent: "parent_of",
  mother_of: "parent_of",
  father_of: "parent_of",
  mentor: "mentor_of",
  teaches: "mentor_of",
  tutor_of: "mentor_of",
  rivals: "rival_of",
  nemesis_of: "rival_of",
  enemy_of_personal: "rival_of",
  married: "married_to",
  spouse_of: "married_to",
  wed_to: "married_to",
  owes: "owes_debt_to",
  indebted_to: "owes_debt_to",
  debt_to: "owes_debt_to",
  appearsin: "appears_in",
  appears: "appears_in",
  shows_up_in: "appears_in",
  featured: "featured_in",
  featuredin: "featured_in",
  spotlighted_in: "featured_in",
  rule_reference: "related_rule",
  rule_related: "related_rule",
  references_rule: "related_rule",
  grantsfeat: "grants_feat",
  unlocksfeat: "grants_feat",
  awards_feat: "grants_feat",
  unlockssubclass: "unlocks_subclass",
  unlocks_class_option: "unlocks_subclass",
  opens_subclass: "unlocks_subclass",
  spawn: "spawns",
  creates: "spawns",
  birthing: "spawns",
  summon: "summons",
  calls_forth: "summons",
  conjures: "summons",
  transforms: "transforms_into",
  turns_into: "transforms_into",
  becomes: "transforms_into",
  before: "preceded_by",
  prior_to: "preceded_by",
  after: "occurs_after",
  afterwards: "occurs_after",
  follows: "followed_by",
  depicts: "depicts",
  illustrates: "depicts",
  shows: "depicts",
  map_of: "depicts",
  references: "references",
  refers_to: "references",
  cites: "references",
  reveals: "reveals",
  uncovers: "reveals",
  exposes: "reveals",
  unlocks: "unlocks_content",
  unlock: "unlocks_content",
  unlocks_path: "unlocks_content",
  generates: "generates",
  produces: "generates",
  creates_entries_for: "generates",
  contains: "contains_entry",
  includes_entry: "contains_entry",
  houses_entry: "contains_entry",
  represents: "represents",
  represents_character: "represents",
  character_sheet_for: "represents",
  documentedby: "documented_by",
  documented_by: "documented_by",
  recorded_by: "documented_by",
  includes_event: "includes_event",
  contains_event: "includes_event",
  features_event: "includes_event",
  route_to: "route_to",
  leads_to: "route_to",
  path_to: "route_to",
  occurs_at: "occurs_at",
  happens_at: "occurs_at",
  takes_place_at: "occurs_at",
  grants_proficiency: "grants_proficiency",
  grants_prof: "grants_proficiency",
  provides_proficiency: "grants_proficiency",
  enables_activity: "enables_activity",
  allows_activity: "enables_activity",
  enables: "enables_activity",
};

/**
 * Normalize free-form relationship labels returned by the LLM into the supported set.
 * Unknown relationships default to `related_to` to preserve weak links for later review.
 */
export function normalizeRelationshipType(raw: unknown): RelationshipType {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "related_to";
  }

  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");

  if (RELATIONSHIP_TYPES.includes(normalized as RelationshipType)) {
    return normalized as RelationshipType;
  }

  const alias =
    RELATIONSHIP_SYNONYMS[normalized] ??
    RELATIONSHIP_SYNONYMS[normalized.replace(/[^a-z_]/g, "")];
  if (alias) {
    return alias;
  }

  return "related_to";
}

/**
 * Whether a given relationship type should be treated as symmetric,
 * meaning the reciprocal edge should be created automatically.
 */
export function isBidirectionalRelationship(type: RelationshipType): boolean {
  return BIDIRECTIONAL_RELATIONSHIPS.includes(type);
}

/**
 * Given a relationship type, derive the reciprocal type to use when synthesising
 * reverse edges. For non-bidirectional relationships, this method simply returns `null`.
 */
export function getReciprocalRelationshipType(
  type: RelationshipType
): RelationshipType | null {
  if (!isBidirectionalRelationship(type)) {
    return null;
  }

  return type;
}

/**
 * Normalize an optional confidence/strength value to a number between 0 and 1.
 */
export function normalizeRelationshipStrength(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) {
      return value;
    }
    // If the model returns a percentage, clamp to 0..1
    if (value > 1 && value <= 100) {
      return Math.min(Math.max(value / 100, 0), 1);
    }
  }

  return null;
}
