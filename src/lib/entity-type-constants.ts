/**
 * Entity type constants for use across the codebase.
 * These constants reference the STRUCTURED_ENTITY_TYPES array to ensure type safety
 * and prevent typos. Import these constants instead of hardcoding entity type strings.
 *
 * This approach ensures a single source of truth - if entity types change in entity-types.ts,
 * these constants automatically reflect those changes.
 */

import { STRUCTURED_ENTITY_TYPES } from "./entity-types";
import type { StructuredEntityType } from "./entity-types";

// Create a lookup object from the array for type-safe access
const ENTITY_TYPES = STRUCTURED_ENTITY_TYPES.reduce(
  (acc, type) => {
    acc[type] = type;
    return acc;
  },
  {} as Record<StructuredEntityType, StructuredEntityType>
);

// Core entities
export const ENTITY_TYPE_MONSTERS = ENTITY_TYPES.monsters;
export const ENTITY_TYPE_NPCS = ENTITY_TYPES.npcs;
export const ENTITY_TYPE_SPELLS = ENTITY_TYPES.spells;
export const ENTITY_TYPE_ITEMS = ENTITY_TYPES.items;
export const ENTITY_TYPE_TRAPS = ENTITY_TYPES.traps;
export const ENTITY_TYPE_HAZARDS = ENTITY_TYPES.hazards;
export const ENTITY_TYPE_CONDITIONS = ENTITY_TYPES.conditions;
export const ENTITY_TYPE_VEHICLES = ENTITY_TYPES.vehicles;
export const ENTITY_TYPE_ENV_EFFECTS = ENTITY_TYPES.env_effects;

// Adventure structure
export const ENTITY_TYPE_HOOKS = ENTITY_TYPES.hooks;
export const ENTITY_TYPE_PLOT_LINES = ENTITY_TYPES.plot_lines;
export const ENTITY_TYPE_QUESTS = ENTITY_TYPES.quests;
export const ENTITY_TYPE_SCENES = ENTITY_TYPES.scenes;

// Locations & world objects
export const ENTITY_TYPE_LOCATIONS = ENTITY_TYPES.locations;
export const ENTITY_TYPE_LAIRS = ENTITY_TYPES.lairs;
export const ENTITY_TYPE_FACTIONS = ENTITY_TYPES.factions;
export const ENTITY_TYPE_DEITIES = ENTITY_TYPES.deities;

// Player-facing mechanics
export const ENTITY_TYPE_BACKGROUNDS = ENTITY_TYPES.backgrounds;
export const ENTITY_TYPE_FEATS = ENTITY_TYPES.feats;
export const ENTITY_TYPE_SUBCLASSES = ENTITY_TYPES.subclasses;
export const ENTITY_TYPE_PCS = ENTITY_TYPES.pcs;
export const ENTITY_TYPE_RULES = ENTITY_TYPES.rules;
export const ENTITY_TYPE_DOWNTIME = ENTITY_TYPES.downtime;

// Reference & generators
export const ENTITY_TYPE_TABLES = ENTITY_TYPES.tables;
export const ENTITY_TYPE_ENCOUNTER_TABLES = ENTITY_TYPES.encounter_tables;
export const ENTITY_TYPE_TREASURE_TABLES = ENTITY_TYPES.treasure_tables;

// Assets & aides
export const ENTITY_TYPE_MAPS = ENTITY_TYPES.maps;
export const ENTITY_TYPE_HANDOUTS = ENTITY_TYPES.handouts;
export const ENTITY_TYPE_PUZZLES = ENTITY_TYPES.puzzles;

// Timelines & campaign glue
export const ENTITY_TYPE_TIMELINES = ENTITY_TYPES.timelines;
export const ENTITY_TYPE_TRAVEL = ENTITY_TYPES.travel;

// Flexible discovery
export const ENTITY_TYPE_CUSTOM = ENTITY_TYPES.custom;
