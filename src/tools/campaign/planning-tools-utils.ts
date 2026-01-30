import type { Entity, EntityDAO } from "@/dao/entity-dao";
import type { EntityGraphService } from "@/services/graph/entity-graph-service";
import type { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { ENTITY_TYPE_PCS } from "@/lib/entity-type-constants";
import { HIGH_RANGE, MEDIUM_RANGE } from "@/lib/importance-config";
import type { StructuredEntityType } from "@/lib/entity-types";

/**
 * Get all player character entities for a campaign.
 */
export async function getPlayerCharacterEntities(
  entityDAO: EntityDAO,
  campaignId: string
): Promise<Entity[]> {
  return entityDAO.listEntitiesByCampaign(campaignId, {
    entityType: ENTITY_TYPE_PCS,
  });
}

/** Script-gap types: subset of StructuredEntityType used when categorizing script gaps. */
export type ScriptGapType = Extract<
  StructuredEntityType,
  "npcs" | "locations" | "items" | "custom"
>;

/** Optional: classify a gap using context around the mention. LLM-based classification is more accurate than heuristics. Use a sync wrapper if you have an async classifier (e.g. call LLM first, then pass a fn that looks up the result). */
export type ClassifyGapFn = (
  contextSnippet: string,
  mentionedName: string
) => ScriptGapType;

/** Extract a snippet of script around the first occurrence of `name` (e.g. sentence or ±N chars). */
function getContextAroundName(
  script: string,
  name: string,
  windowChars = 200
): string {
  const idx = script.toLowerCase().indexOf(name.toLowerCase());
  if (idx < 0) return script.slice(0, windowChars);
  const start = Math.max(0, idx - windowChars);
  const end = Math.min(script.length, idx + name.length + windowChars);
  return script.slice(start, end);
}

/** Heuristic classification based on keywords in a snippet. Unreliable; an LLM classifier is preferred. */
function classifyGapHeuristic(snippet: string): ScriptGapType {
  const s = snippet.toLowerCase();
  if (/\b(npc|character|speaks?|says?)\b/.test(s)) {
    return "npcs";
  }
  if (/\b(location|place|area|room|enters?|arrives?)\b/.test(s)) {
    return "locations";
  }
  if (/\b(item|treasure|artifact|loot|finds?|receives?)\b/.test(s)) {
    return "items";
  }
  return "custom";
}

/**
 * Analyze the generated script for world-building gaps.
 * Gap types use StructuredEntityType (npcs, locations, items) or "custom".
 *
 * Classification uses a context snippet around each mention (not the whole script).
 * The built-in heuristic is best-effort; for better accuracy pass `classifyGap` (e.g. LLM-based).
 */
export function analyzeGaps(
  script: string,
  availableEntities: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
  }>,
  options?: { classifyGap?: ClassifyGapFn }
): Array<{
  type: ScriptGapType;
  description: string;
  suggestion: string;
}> {
  const gaps: Array<{
    type: ScriptGapType;
    description: string;
    suggestion: string;
  }> = [];

  const entityNamePattern =
    /\[\[([^\]]+)\]\]|"([^"]+)"|NPC[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const mentionedNames = new Set<string>();
  let match: RegExpExecArray | null;
  match = entityNamePattern.exec(script);
  while (match !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && name.length > 2) {
      mentionedNames.add(name.trim());
    }
    match = entityNamePattern.exec(script);
  }

  const availableNames = new Set(
    availableEntities.map((e) => e.entityName.toLowerCase())
  );

  const classify =
    options?.classifyGap ??
    ((snippet: string) => classifyGapHeuristic(snippet));

  mentionedNames.forEach((name) => {
    const lowerName = name.toLowerCase();
    if (!availableNames.has(lowerName)) {
      const contextSnippet = getContextAroundName(script, name);
      const type = classify(contextSnippet, name);
      if (type === "npcs") {
        gaps.push({
          type: "npcs",
          description: `NPC "${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to the campaign, including their personality, motivations, and relationship to the party.`,
        });
      } else if (type === "locations") {
        gaps.push({
          type: "locations",
          description: `Location "${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to the campaign, including its description, atmosphere, and key features.`,
        });
      } else if (type === "items") {
        gaps.push({
          type: "items",
          description: `Item or object "${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding ${name} as an item entity with description and properties.`,
        });
      } else {
        gaps.push({
          type: "custom",
          description: `"${name}" is mentioned in the script but not found in campaign entities`,
          suggestion: `Consider adding details about ${name} to ensure consistency and depth.`,
        });
      }
    }
  });

  return gaps;
}

/** A session hook: title, description, setup, payoff. */
export interface SessionHook {
  title: string;
  description: string;
  setup: string;
  payoff: string;
}

/** Optional: generate hooks with an LLM using campaign context. Yields campaign-relevant hooks; when not provided, static templates are used. */
export type GenerateHooksFn = (
  type: string,
  context: string,
  characters: unknown[],
  resources: unknown[]
) => Promise<SessionHook[]>;

/** Static session hook templates (generic fallbacks). Used when no LLM generator is provided. */
function getStaticSessionHooks(type: string): SessionHook[] {
  const hooks: SessionHook[] = [];
  switch (type) {
    case "opening":
      hooks.push(
        {
          title: "Mysterious Message",
          description:
            "The party receives an urgent message from a mysterious source",
          setup: "A raven delivers a sealed letter with an urgent request",
          payoff: "The message leads to an important discovery or quest",
        },
        {
          title: "Unexpected Visitor",
          description: "An unexpected NPC arrives with important news",
          setup: "A familiar or new NPC appears with urgent information",
          payoff:
            "The visitor's information sets up the session's main conflict",
        }
      );
      break;
    case "transition":
      hooks.push({
        title: "Fork in the Road",
        description: "The party must choose between multiple paths",
        setup: "Present two or more equally compelling options",
        payoff: "Each choice leads to different consequences and opportunities",
      });
      break;
    case "cliffhanger":
      hooks.push({
        title: "Sudden Interruption",
        description: "Something unexpected interrupts the current situation",
        setup: "An alarm sounds, a messenger arrives, or danger appears",
        payoff: "The interruption creates urgency and drives the story forward",
      });
      break;
    case "resolution":
      hooks.push({
        title: "Revelation",
        description: "A hidden truth is revealed",
        setup: "Information that changes the party's understanding",
        payoff: "The revelation provides closure or sets up future sessions",
      });
      break;
  }
  return hooks;
}

/**
 * Generate session hooks by type (opening, transition, cliffhanger, resolution).
 * When options.generator is provided (e.g. LLM-based), it is called with campaign context
 * and returns campaign-relevant hooks. Otherwise returns static templates.
 */
export async function generateHooks(
  type: string,
  context: string = "",
  characters: unknown[] = [],
  resources: unknown[] = [],
  options?: { generator?: GenerateHooksFn }
): Promise<SessionHook[]> {
  if (options?.generator) {
    return options.generator(type, context, characters, resources);
  }
  return getStaticSessionHooks(type);
}

/**
 * Determines gap severity based on entity importance.
 */
export function getGapSeverityByImportance(
  entityType: string,
  importanceScore: number
): "critical" | "important" | "minor" {
  if (entityType === ENTITY_TYPE_PCS) {
    return "critical";
  }
  if (importanceScore >= HIGH_RANGE.min) {
    return "important";
  }
  if (importanceScore >= MEDIUM_RANGE.min) {
    return "minor";
  }
  return "minor";
}

/**
 * Analyzes a player character entity for completeness.
 */
export async function analyzePlayerCharacterCompleteness(
  character: {
    id: string;
    name: string;
    entityType: string;
    content?: unknown;
    metadata?: unknown;
  },
  campaignId: string,
  entityGraphService: EntityGraphService,
  importanceService?: EntityImportanceService
): Promise<
  Array<{
    type: string;
    severity: "critical" | "important" | "minor";
    description: string;
    suggestion: string;
  }>
> {
  const gaps: Array<{
    type: string;
    severity: "critical" | "important" | "minor";
    description: string;
    suggestion: string;
  }> = [];

  const characterName = character.name;
  let content: Record<string, unknown> = {};
  let metadata: Record<string, unknown> = {};

  if (character.content && typeof character.content === "object") {
    content = character.content as Record<string, unknown>;
  } else if (typeof character.content === "string") {
    try {
      content = JSON.parse(character.content) as Record<string, unknown>;
    } catch {
      content = { backstory: character.content };
    }
  }

  if (character.metadata && typeof character.metadata === "object") {
    metadata = character.metadata as Record<string, unknown>;
  } else if (typeof character.metadata === "string") {
    try {
      metadata = JSON.parse(character.metadata) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }

  let importanceScore = 100;
  if (importanceService) {
    try {
      importanceScore = await importanceService.getEntityImportance(
        campaignId,
        character.id
      );
    } catch (error) {
      console.warn(
        `[analyzePlayerCharacterCompleteness] Failed to get importance for ${character.id}:`,
        error
      );
      importanceScore = 100;
    }
  }

  const hasBackstory = !!(
    content.backstory ||
    content.summary ||
    metadata.backstory
  );
  if (!hasBackstory) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_backstory_${character.id}`,
      severity,
      description: `${characterName} lacks a backstory or summary.`,
      suggestion: `Add a backstory for ${characterName} to help create meaningful character moments and tie-ins to the campaign world.`,
    });
  }

  const hasMotivations = !!(
    content.motivations ||
    content.motivation ||
    metadata.motivations ||
    metadata.motivation ||
    (content.personalityTraits &&
      typeof content.personalityTraits === "string" &&
      (content.personalityTraits as string).length > 50)
  );
  if (!hasMotivations) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_motivations_${character.id}`,
      severity,
      description: `${characterName} lacks defined motivations.`,
      suggestion: `Define what motivates ${characterName}. What drives them? What do they care about? This helps create compelling character-driven moments in sessions.`,
    });
  }

  const hasGoals = !!(
    (content.goals &&
      Array.isArray(content.goals) &&
      (content.goals as unknown[]).length > 0) ||
    (content.goals &&
      typeof content.goals === "string" &&
      (content.goals as string).trim().length > 0) ||
    (metadata.goals &&
      Array.isArray(metadata.goals) &&
      (metadata.goals as unknown[]).length > 0) ||
    (metadata.goals &&
      typeof metadata.goals === "string" &&
      (metadata.goals as string).trim().length > 0)
  );
  if (!hasGoals) {
    const severity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    gaps.push({
      type: `character_goals_${character.id}`,
      severity,
      description: `${characterName} lacks defined goals.`,
      suggestion: `Define goals for ${characterName}. What do they want to achieve? Short-term and long-term goals help drive character arcs and create opportunities for character spotlight moments.`,
    });
  }

  let hasRelationships = false;
  try {
    const neighbors = await entityGraphService.getNeighbors(
      campaignId,
      character.id,
      { maxDepth: 1 }
    );
    hasRelationships = neighbors.length > 0;

    if (!hasRelationships) {
      const severity = getGapSeverityByImportance(
        character.entityType,
        importanceScore
      );
      gaps.push({
        type: `character_relationships_${character.id}`,
        severity,
        description: `${characterName} has no connections to other entities in the campaign world.`,
        suggestion: `Connect ${characterName} to NPCs, locations, factions, or other entities. Who do they know? Who are their allies? This helps create meaningful interactions and story hooks.`,
      });
    } else {
      const hasEnemies = neighbors.some((neighbor) => {
        const relType = (neighbor.relationshipType ?? "").toLowerCase();
        return (
          relType.includes("enemy") ||
          relType.includes("rival") ||
          relType.includes("hostile") ||
          relType.includes("opposed")
        );
      });

      if (!hasEnemies && neighbors.length > 0) {
        const severity =
          character.entityType === ENTITY_TYPE_PCS ? "important" : "minor";
        gaps.push({
          type: `character_enemies_${character.id}`,
          severity,
          description: `${characterName} has relationships but no clear enemies or antagonists.`,
          suggestion: `Consider adding enemies or rivals for ${characterName}. Conflict creates drama and gives characters something to overcome. Who opposes them?`,
        });
      }
    }
  } catch (error) {
    console.warn(
      `[analyzePlayerCharacterCompleteness] Failed to check relationships for ${character.id}:`,
      error
    );
  }

  const hasSpotlightMoments = !!(
    content.spotlightMoments ||
    content.spotlight_moments ||
    content.characterArc ||
    content.character_arc ||
    metadata.spotlightMoments ||
    metadata.spotlight_moments ||
    metadata.characterArc ||
    metadata.character_arc ||
    (content.goals &&
      Array.isArray(content.goals) &&
      (content.goals as unknown[]).some(
        (g: unknown) =>
          typeof g === "string" &&
          ((g as string).toLowerCase().includes("arc") ||
            (g as string).toLowerCase().includes("spotlight"))
      ))
  );
  if (!hasSpotlightMoments) {
    const severity =
      character.entityType === ENTITY_TYPE_PCS ? "important" : "minor";
    gaps.push({
      type: `character_spotlight_${character.id}`,
      severity,
      description: `No spotlight moments or character arc planning found for ${characterName}.`,
      suggestion: `Plan special moments in the campaign arc for ${characterName}. What character-specific moments, revelations, or challenges will they face? This ensures each player gets meaningful character development.`,
    });
  }

  const hasPersonality = !!(
    content.personalityTraits ||
    content.personality_traits ||
    content.personality ||
    metadata.personalityTraits ||
    metadata.personality_traits ||
    metadata.personality
  );
  if (!hasPersonality && !hasBackstory) {
    const baseSeverity = getGapSeverityByImportance(
      character.entityType,
      importanceScore
    );
    const severity = baseSeverity === "critical" ? "important" : baseSeverity;
    gaps.push({
      type: `character_personality_${character.id}`,
      severity,
      description: `${characterName} lacks personality traits or defining characteristics.`,
      suggestion: `Add personality traits, quirks, or defining characteristics for ${characterName}. This helps you roleplay them consistently and create memorable moments.`,
    });
  }

  return gaps;
}
