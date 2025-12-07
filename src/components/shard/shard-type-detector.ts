/**
 * Utility for detecting and categorizing shard types
 * Handles both structured and unstructured shard data
 */

import {
  STRUCTURED_ENTITY_TYPES,
  type StructuredEntityType,
  getEntityTypeDisplayName,
} from "../../lib/entity-types";

export interface ShardMetadata {
  id: string;
  type: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface StructuredShard extends ShardMetadata {
  type: StructuredEntityType;
  contentId?: string; // Original content ID from parsed JSON (e.g., "night-hag")
}

export interface FlexibleShard extends ShardMetadata {
  type: string; // Any other type not in STRUCTURED_ENTITY_TYPES
}

export type Shard = StructuredShard | FlexibleShard;

/**
 * We don't define required properties here since users should be able to edit anything.
 * The system is flexible and allows editing of all properties regardless of type.
 */

/**
 * Check if a shard matches a known structured type
 * Simply checks if the type is in our structured content types list
 */
export function isKnownStructure(shard: Shard): shard is StructuredShard {
  return STRUCTURED_ENTITY_TYPES.includes(shard.type as StructuredEntityType);
}

/**
 * Get the expected structure for a shard type
 * Returns null since we don't enforce specific structures
 */
export function getShardStructure(_type: string) {
  return null;
}

/**
 * Extract editable properties from a shard (excluding metadata fields)
 */
export function getEditableProperties(shard: Shard): Array<{
  key: string;
  value: unknown;
  type: "string" | "number" | "array" | "object";
}> {
  const excludeFields = ["id", "metadata", "created_at", "updated_at"];

  const properties = Object.entries(shard)
    .filter(([key]) => !excludeFields.includes(key))
    .map(([key, value]) => ({
      key: key || "unnamed",
      value,
      type: getValueType(value),
    }));

  // Remove duplicates based on key
  const seenKeys = new Set<string>();
  return properties.filter(({ key }) => {
    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });
}

/**
 * Determine the type of a value for appropriate editing UI
 */
function getValueType(
  value: unknown
): "string" | "number" | "array" | "object" {
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "object";
  return "string";
}

/**
 * Validate shard structure and suggest fixes
 */
export function validateShardStructure(_shard: Shard): {
  isValid: boolean;
  missingRequired: string[];
  suggestions: string[];
} {
  // Since we don't enforce specific structures, all shards are valid
  return {
    isValid: true,
    missingRequired: [],
    suggestions: ["Consider creating a template for this shard type"],
  };
}

/**
 * Get display-friendly name for a shard type
 * Uses the existing getEntityTypeDisplayName function when possible
 */
export function getShardTypeDisplayName(type: string): string {
  // Use existing function for structured entity types
  if (STRUCTURED_ENTITY_TYPES.includes(type as StructuredEntityType)) {
    return getEntityTypeDisplayName(type as StructuredEntityType);
  }

  // Handle custom types not in the structured list
  const customDisplayNames: Record<string, string> = {
    custom_content: "Custom Content",
    lore: "Lore",
    rule: "Rule",
  };

  return (
    customDisplayNames[type] ||
    type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

/**
 * Get icon for shard type - returns CSS class for dark theme compatible icons
 */
export function getShardTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    spells: "spell-icon",
    monsters: "monster-icon",
    items: "item-icon",
    locations: "location-icon",
    npcs: "npc-icon",
    backgrounds: "background-icon",
    feats: "feat-icon",
    rules: "rule-icon",
    traps: "trap-icon",
    hazards: "hazard-icon",
    conditions: "condition-icon",
    vehicles: "vehicle-icon",
    env_effects: "env-effect-icon",
    hooks: "hook-icon",
    plot_lines: "plot-icon",
    quests: "quest-icon",
    scenes: "scene-icon",
    lairs: "lair-icon",
    factions: "faction-icon",
    deities: "deity-icon",
    subclasses: "subclass-icon",
    characters: "character-icon",
    character_sheets: "sheet-icon",
    downtime: "downtime-icon",
    tables: "table-icon",
    encounter_tables: "encounter-icon",
    treasure_tables: "treasure-icon",
    maps: "map-icon",
    handouts: "handout-icon",
    puzzles: "puzzle-icon",
    timelines: "timeline-icon",
    travel: "travel-icon",
    custom: "custom-icon",
    // Legacy single names for backward compatibility
    spell: "spell-icon",
    monster: "monster-icon",
    item: "item-icon",
    location: "location-icon",
    npc: "npc-icon",
    class: "class-icon",
    feat: "feat-icon",
    custom_content: "custom-icon",
    lore: "lore-icon",
    rule: "rule-icon",
    background: "background-icon",
  };

  return icons[type] || "default-icon";
}

/**
 * Get confidence level color class - optimized for dark theme
 */
export function getConfidenceColorClass(confidence: number): string {
  if (confidence >= 0.9) return "text-green-400";
  if (confidence >= 0.75) return "text-yellow-400";
  if (confidence >= 0.6) return "text-orange-400";
  return "text-red-400";
}

/**
 * Get confidence level description
 */
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 90) return "High confidence";
  if (confidence >= 75) return "Good confidence";
  if (confidence >= 60) return "Moderate confidence";
  return "Low confidence";
}
