/**
 * Player character onboarding helpers.
 * Tracks sheet completeness via entities.metadata.pcOnboardingStatus.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import { ENTITY_TYPE_PCS } from "@/lib/entity/entity-type-constants";
import { analyzePlayerCharacterCompleteness } from "@/tools/campaign/planning-tools-utils";

export const PC_ONBOARDING_STATUS = {
	INCOMPLETE: "incomplete",
	COMPLETE: "complete",
} as const;

export type PcOnboardingStatus =
	(typeof PC_ONBOARDING_STATUS)[keyof typeof PC_ONBOARDING_STATUS];

export interface PlayerPcOnboardingGap {
	type: string;
	severity: "critical" | "important" | "minor";
	description: string;
	suggestion: string;
	category: "well-formed" | "well-connected";
}

const DEFAULT_NEW_CHARACTER_NAME = "New character";

function parseRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return {};
		}
	}
	return {};
}

export function parsePcEntityContent(entity: Entity): Record<string, unknown> {
	const content = parseRecord(entity.content);
	if (
		Object.keys(content).length === 0 &&
		typeof entity.content === "string" &&
		entity.content.trim().length > 0
	) {
		return { backstory: entity.content };
	}
	return content;
}

export function parsePcEntityMetadata(entity: Entity): Record<string, unknown> {
	return parseRecord(entity.metadata);
}

export function getPcOnboardingStatus(
	entity: Entity | null
): PcOnboardingStatus | null {
	if (!entity) return null;
	const metadata = parsePcEntityMetadata(entity);
	const status = metadata.pcOnboardingStatus;
	if (status === PC_ONBOARDING_STATUS.COMPLETE) {
		return PC_ONBOARDING_STATUS.COMPLETE;
	}
	if (status === PC_ONBOARDING_STATUS.INCOMPLETE) {
		return PC_ONBOARDING_STATUS.INCOMPLETE;
	}
	return null;
}

function hasMeaningfulBackstory(
	content: Record<string, unknown>,
	metadata: Record<string, unknown>
): boolean {
	const summary =
		typeof content.summary === "string" ? content.summary.trim() : "";
	const backstory =
		typeof content.backstory === "string" ? content.backstory.trim() : "";
	const metadataBackstory =
		typeof metadata.backstory === "string" ? metadata.backstory.trim() : "";
	return (
		summary.length > 0 || backstory.length > 0 || metadataBackstory.length > 0
	);
}

export function isPcOnboardingIncomplete(entity: Entity | null): boolean {
	if (!entity) return false;

	const metadata = parsePcEntityMetadata(entity);
	const status = metadata.pcOnboardingStatus;
	if (status === PC_ONBOARDING_STATUS.COMPLETE) {
		return false;
	}
	if (status === PC_ONBOARDING_STATUS.INCOMPLETE) {
		return true;
	}

	const content = parsePcEntityContent(entity);
	if (metadata.createdByPlayer && !hasMeaningfulBackstory(content, metadata)) {
		return true;
	}

	const name = entity.name?.trim() ?? "";
	if (
		name.length === 0 ||
		name.toLowerCase() === DEFAULT_NEW_CHARACTER_NAME.toLowerCase()
	) {
		return metadata.createdByPlayer === true;
	}

	return false;
}

function hasNonEmptyString(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyArray(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0;
}

function addWellFormedGap(
	gaps: PlayerPcOnboardingGap[],
	params: {
		type: string;
		severity: PlayerPcOnboardingGap["severity"];
		description: string;
		suggestion: string;
	}
): void {
	if (gaps.some((gap) => gap.type === params.type)) {
		return;
	}
	gaps.push({ ...params, category: "well-formed" });
}

function addWellConnectedGap(
	gaps: PlayerPcOnboardingGap[],
	params: {
		type: string;
		severity: PlayerPcOnboardingGap["severity"];
		description: string;
		suggestion: string;
	}
): void {
	if (gaps.some((gap) => gap.type === params.type)) {
		return;
	}
	gaps.push({ ...params, category: "well-connected" });
}

async function addPlayerFacingGaps(
	entity: Entity,
	campaignId: string,
	env: { DB?: D1Database; [key: string]: unknown },
	gaps: PlayerPcOnboardingGap[]
): Promise<void> {
	const content = parsePcEntityContent(entity);
	const metadata = parsePcEntityMetadata(entity);
	const characterName = entity.name?.trim() || "your character";

	if (
		!entity.name?.trim() ||
		entity.name.trim().toLowerCase() ===
			DEFAULT_NEW_CHARACTER_NAME.toLowerCase()
	) {
		addWellFormedGap(gaps, {
			type: `pc_name_${entity.id}`,
			severity: "critical",
			description: `${characterName} still uses a placeholder name.`,
			suggestion:
				"Choose a proper character name that fits the campaign and your concept.",
		});
	}

	if (!hasNonEmptyString(content.characterClass ?? metadata.characterClass)) {
		addWellFormedGap(gaps, {
			type: `pc_class_${entity.id}`,
			severity: "important",
			description: `${characterName} is missing a class or role.`,
			suggestion:
				"Pick a class, profession, or role that matches the campaign's game system.",
		});
	}

	if (!hasNonEmptyString(content.characterRace ?? metadata.characterRace)) {
		addWellFormedGap(gaps, {
			type: `pc_race_${entity.id}`,
			severity: "important",
			description: `${characterName} is missing a species, ancestry, or race.`,
			suggestion:
				"Define species or ancestry using campaign rules or a fitting custom choice.",
		});
	}

	const level = content.characterLevel ?? metadata.characterLevel;
	if (level === undefined || level === null || level === "") {
		addWellFormedGap(gaps, {
			type: `pc_level_${entity.id}`,
			severity: "important",
			description: `${characterName} is missing a level or tier.`,
			suggestion: "Set an appropriate starting level for the campaign.",
		});
	}

	const hasAttributes = !!(
		content.attributes ||
		content.stats ||
		content.abilityScores ||
		content.abilities ||
		content.ability_scores
	);
	if (!hasAttributes) {
		addWellFormedGap(gaps, {
			type: `pc_attributes_${entity.id}`,
			severity: "important",
			description: `${characterName} is missing attributes or core stats.`,
			suggestion:
				"Add ability scores, attributes, or equivalent stats from the campaign rules.",
		});
	}

	const hasInventory = !!(
		hasNonEmptyArray(content.inventory) ||
		hasNonEmptyArray(content.items) ||
		hasNonEmptyString(content.inventory) ||
		hasNonEmptyString(content.equipment)
	);
	if (!hasInventory) {
		addWellFormedGap(gaps, {
			type: `pc_inventory_${entity.id}`,
			severity: "minor",
			description: `${characterName} has no inventory or starting gear recorded.`,
			suggestion:
				"List starting equipment, weapons, tools, or notable items for the character.",
		});
	}

	const daoFactory = getDAOFactory(env);
	const spellEntityCount = await daoFactory.entityDAO.getEntityCountByCampaign(
		campaignId,
		{ entityType: "spells" }
	);
	const hasSpells = !!(
		hasNonEmptyArray(content.spells) ||
		hasNonEmptyArray(content.spellcasting) ||
		hasNonEmptyString(content.spells)
	);
	if (spellEntityCount > 0 && !hasSpells) {
		addWellFormedGap(gaps, {
			type: `pc_spells_${entity.id}`,
			severity: "minor",
			description: `${characterName} has no spells or spellcasting details recorded.`,
			suggestion:
				"Add known spells, cantrips, or spellcasting notes if the character casts magic.",
		});
	}

	const otherPcEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
		campaignId,
		{ entityType: ENTITY_TYPE_PCS, orderBy: "name" }
	);
	const otherPcNames = otherPcEntities
		.filter((pc) => pc.id !== entity.id)
		.map((pc) => pc.name.toLowerCase());

	const relationshipStrings: string[] = [];
	if (hasNonEmptyArray(content.relationships)) {
		for (const rel of content.relationships as unknown[]) {
			if (typeof rel === "string") {
				relationshipStrings.push(rel.toLowerCase());
			}
		}
	} else if (hasNonEmptyString(content.relationships)) {
		relationshipStrings.push(String(content.relationships).toLowerCase());
	}

	const mentionsAnotherPc = otherPcNames.some((name) =>
		relationshipStrings.some((rel) => rel.includes(name))
	);

	let hasPcGraphNeighbor = false;
	try {
		const neighbors = await daoFactory.entityGraphService.getNeighbors(
			campaignId,
			entity.id,
			{ maxDepth: 1 }
		);
		hasPcGraphNeighbor = neighbors.some((neighbor) => {
			const type = (neighbor.entityType ?? "").toLowerCase();
			return (
				(type === "pcs" || type === "pc") && neighbor.entityId !== entity.id
			);
		});
	} catch {
		hasPcGraphNeighbor = false;
	}

	if (otherPcNames.length > 0 && !mentionsAnotherPc && !hasPcGraphNeighbor) {
		addWellConnectedGap(gaps, {
			type: `pc_party_tie_${entity.id}`,
			severity: "important",
			description: `${characterName} is not yet tied to another player character in the party.`,
			suggestion: `Connect ${characterName} to at least one other PC through shared history, bonds, or relationships.`,
		});
	}
}

export async function getPcOnboardingGaps(
	entity: Entity,
	campaignId: string,
	env: { DB?: D1Database; [key: string]: unknown }
): Promise<PlayerPcOnboardingGap[]> {
	const daoFactory = getDAOFactory(env);
	const completenessGaps = await analyzePlayerCharacterCompleteness(
		{
			id: entity.id,
			name: entity.name,
			entityType: entity.entityType,
			content: entity.content,
			metadata: entity.metadata,
		},
		campaignId,
		daoFactory.entityGraphService
	);

	const gaps: PlayerPcOnboardingGap[] = completenessGaps.map((gap) => ({
		...gap,
		category: gap.type.includes("relationship")
			? "well-connected"
			: "well-formed",
	}));

	await addPlayerFacingGaps(entity, campaignId, env, gaps);
	return gaps;
}

export function getBlockingOnboardingGaps(
	gaps: PlayerPcOnboardingGap[]
): PlayerPcOnboardingGap[] {
	return gaps.filter(
		(gap) => gap.severity === "critical" || gap.severity === "important"
	);
}

export async function markPcOnboardingComplete(
	entityId: string,
	env: { DB?: D1Database; [key: string]: unknown }
): Promise<{
	success: boolean;
	remainingGaps?: PlayerPcOnboardingGap[];
}> {
	const daoFactory = getDAOFactory(env);
	const entity = await daoFactory.entityDAO.getEntityById(entityId);
	if (!entity) {
		throw new Error("Entity not found");
	}

	const gaps = await getPcOnboardingGaps(entity, entity.campaignId, env);
	const blockingGaps = getBlockingOnboardingGaps(gaps);
	if (blockingGaps.length > 0) {
		return { success: false, remainingGaps: blockingGaps };
	}

	const metadata = parsePcEntityMetadata(entity);
	await daoFactory.entityDAO.updateEntity(entityId, {
		metadata: {
			...metadata,
			pcOnboardingStatus: PC_ONBOARDING_STATUS.COMPLETE,
		},
	});

	return { success: true };
}
