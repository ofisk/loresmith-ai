/**
 * Pure helper functions for campaign suggestions and readiness assessment.
 * No env, DAO, or LLM dependencies – safe to unit test.
 */

import type { StructuredEntityType } from "@/lib/entity/entity-types";
import {
	CAMPAIGN_READINESS_ENTITY_TYPES,
	isValidEntityType,
	READINESS_ENTITY_BUCKETS,
} from "@/lib/entity/entity-types";

export interface EntityReadinessStats {
	entityTypeCounts: Record<string, number>;
	lowRelationshipEntities: {
		id: string;
		name: string;
		entityType: string;
		relationshipCount: number;
	}[];
}

export interface SemanticChecklistAnalysis {
	coverage: Record<string, boolean>;
	entityStats?: EntityReadinessStats;
}

/**
 * Checklist items used for campaign readiness.
 * Exported for reuse in semantic analysis and tests.
 */
export const CHECKLIST_ITEMS = [
	{
		key: "campaign_tone",
		description:
			"overall campaign tone and mood for this game (for example lighthearted, grim, cozy, political, mythic, horror, epic), as implied by the campaign description, tags, GM notes, and the most prominent entities",
	},
	{
		key: "core_themes",
		description:
			"core themes and central ideas of the campaign (for example power, faith, legacy, corruption, found family, rebellion), as described in campaign notes, worldbuilding text, or recurring entities and factions",
	},
	{
		key: "world_name",
		description:
			"the proper-name of the campaign world or primary region (for example a world, continent, or plane name) mentioned in campaign description or setting notes",
	},
	{
		key: "cultural_trait",
		description:
			"dominant cultural traits or societal norms that define everyday life in the main region (attitudes, customs, taboos, social structures)",
	},
	{
		key: "magic_system",
		description:
			"how magic works in this setting, how common it is, and how people react to it, based on setting descriptions, notes, and rules variants",
	},
	{
		key: "starting_location",
		description:
			"the main starting town, city, or hub location for the campaign (its name and a short description of why people live there and what's notable about it)",
	},
	{
		key: "starting_npcs",
		description:
			"important NPCs present in the starting area (names, roles, goals, or fears) that the party is likely to meet early in the campaign",
	},
	{
		key: "factions",
		description:
			"factions or organizations with conflicting goals or agendas in the campaign world, including what they want and how they operate",
	},
	{
		key: "campaign_pitch",
		description:
			"a short 1–2 sentence campaign elevator pitch or summary that describes the premise, tone, and stakes of the campaign",
	},
] as const;

/**
 * Generate suggestions for a given type. Pure function – no I/O.
 */
export function generateSuggestions(
	type: string,
	_characters: unknown[],
	_resources: unknown[],
	_context?: string
): Array<{
	title: string;
	description: string;
	priority?: string;
	estimatedTime?: string;
}> {
	const suggestions: Array<{
		title: string;
		description: string;
		priority?: string;
		estimatedTime?: string;
	}> = [];

	switch (type) {
		case "session":
			suggestions.push(
				{
					title: "Plan a Combat Encounter",
					description:
						"Design an engaging combat scenario based on your party composition",
					priority: "high",
					estimatedTime: "30 minutes",
				},
				{
					title: "Create Social Interaction",
					description: "Develop NPC interactions and dialogue opportunities",
					priority: "medium",
					estimatedTime: "20 minutes",
				}
			);
			break;
		case "character":
			suggestions.push({
				title: "Character Development Arc",
				description: "Plan character growth and story progression",
				priority: "high",
				estimatedTime: "25 minutes",
			});
			break;
		case "plot":
			suggestions.push({
				title: "Main Story Advancement",
				description: "Move the main plot forward with key story beats",
				priority: "high",
				estimatedTime: "40 minutes",
			});
			break;
		default:
			suggestions.push({
				title: "General Session Planning",
				description:
					"Prepare a well-rounded session with multiple encounter types",
				priority: "medium",
				estimatedTime: "45 minutes",
			});
	}

	return suggestions;
}

/**
 * Convert readiness score to descriptive campaign state label.
 */
export function getCampaignState(score: number): string {
	if (score >= 90) return "Legendary";
	if (score >= 80) return "Epic-Ready";
	if (score >= 70) return "Well-Traveled";
	if (score >= 60) return "Flourishing";
	if (score >= 50) return "Growing Strong";
	if (score >= 40) return "Taking Shape";
	if (score >= 30) return "Taking Root";
	if (score >= 20) return "Newly Forged";
	return "Fresh Start";
}

/**
 * Sum entity counts for a bucket of types.
 */
export function sumBucket(
	bucket: StructuredEntityType[],
	counts: Record<string, number>
): number {
	return bucket.reduce((sum, type) => sum + (counts[type] || 0), 0);
}

/**
 * Build readiness recommendations from coverage and entity stats.
 * Pure function – no I/O.
 */
export function buildReadinessRecommendations(params: {
	coverage: Record<string, boolean> | undefined;
	entityStats: EntityReadinessStats | undefined;
	characters: unknown[];
	resources: unknown[];
	score: number;
}): string[] {
	const { coverage, entityStats, characters, resources, score } = params;
	const recommendations: string[] = [];

	if (coverage) {
		if (!coverage.campaign_tone) {
			recommendations.push(
				"Define campaign tone (heroic, grim, cozy, etc.) - You can chat with me about this or upload files containing tone descriptions"
			);
		}
		if (!coverage.core_themes) {
			recommendations.push(
				"Define core themes for your campaign - You can discuss themes with me or upload documents that describe your campaign themes"
			);
		}
		if (!coverage.world_name) {
			recommendations.push(
				"Name your campaign world or region - You can tell me the name or upload files that mention the world name"
			);
		}
		if (!coverage.starting_location) {
			recommendations.push(
				"Establish your starting location - You can describe it in chat or upload location descriptions from your notes"
			);
		}
		if (!coverage.factions) {
			recommendations.push(
				"Define factions or organizations in your world - You can discuss them with me or upload documents describing your factions"
			);
		}

		if (entityStats) {
			const counts = entityStats.entityTypeCounts;

			const npcCount = sumBucket(READINESS_ENTITY_BUCKETS.npcLike, counts);
			if (npcCount < 3) {
				recommendations.push(
					"Create 3–5 named NPCs tied to your starting location (allies, patrons, troublemakers)."
				);
			}

			const factionCount = sumBucket(
				READINESS_ENTITY_BUCKETS.factionLike,
				counts
			);
			if (factionCount < 2) {
				recommendations.push(
					"Define at least two factions with conflicting goals to drive tension in your campaign."
				);
			}

			const locationCount = sumBucket(
				READINESS_ENTITY_BUCKETS.locationLike,
				counts
			);
			if (locationCount === 0) {
				recommendations.push(
					"Establish your starting town or hub area with a few key locations players can visit."
				);
			}

			const hookCount = sumBucket(READINESS_ENTITY_BUCKETS.hookLike, counts);
			if (hookCount === 0) {
				recommendations.push(
					"Create 2–3 concrete adventure hooks or quests the party can pursue next."
				);
			}

			const lowRel = entityStats.lowRelationshipEntities;
			if (lowRel && lowRel.length > 0) {
				const names = lowRel
					.slice(0, 3)
					.map((e) => e.name)
					.filter(Boolean);

				if (names.length > 0) {
					recommendations.push(
						`Deepen your world by adding relationships for key entities like ${names.join(
							", "
						)} (aim for at least 3 connections each to NPCs, locations, and factions).`
					);
				} else {
					recommendations.push(
						"Many entities in your world only connect to 0–2 others. Add more relationships between NPCs, factions, and locations to make the world feel interconnected."
					);
				}
			}
		}
	} else {
		if (score < 50) {
			recommendations.push("Add more campaign context and resources");
		}
		if (characters.length < 2) {
			recommendations.push("Create more character profiles");
		}
		if (resources.length < 2) {
			recommendations.push("Add more campaign resources");
		}
	}

	return recommendations;
}

/**
 * Compute entity type counts from a list of entities.
 * Filters to known structured types only.
 */
export function computeEntityTypeCounts(
	entities: Array<{ entityType?: string }>
): Record<string, number> {
	const entityTypeCounts: Record<string, number> = {};
	for (const entity of entities) {
		const type = entity.entityType || "unknown";
		if (!isValidEntityType(type)) continue;
		entityTypeCounts[type] = (entityTypeCounts[type] || 0) + 1;
	}
	return entityTypeCounts;
}

/**
 * Check if an entity covers theme_preference (for tone + core_themes).
 */
export function isThemePreferenceEntity(entity: {
	entityType?: string;
	metadata?: unknown;
}): boolean {
	if (entity.entityType !== "conversational_context") return false;
	const metadata = (entity.metadata ?? {}) as Record<string, unknown>;
	const noteType = (metadata.noteType as string) || "";
	return noteType === "theme_preference";
}

/**
 * Campaign readiness entity types used for analysis.
 */
export { CAMPAIGN_READINESS_ENTITY_TYPES };
