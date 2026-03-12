/**
 * Fetches character creation rules from the campaign entity graph.
 * Extracts classes, species/ancestries, and rule excerpts for system-agnostic character generation.
 */

import type { DAOFactory } from "@/dao/dao-factory";

/** Exclude staging/rejected shards when fetching rules. */
const EXCLUDED_SHARD_STATUSES = ["staging", "rejected", "deleted"];

/** Maximum rule text to include in prompts (chars). */
const MAX_RULE_EXCERPTS_CHARS = 4000;

export interface CharacterCreationRules {
	/** Available character classes/roles (from subclasses, rules). */
	classes: string[];
	/** Available species/races/ancestries (from rules, house rules, pcs). */
	species: string[];
	/** Raw rule excerpts relevant to character creation. */
	ruleExcerpts: string;
}

export interface FetchCharacterRulesResult {
	rules: CharacterCreationRules;
	/** True if we have at least some classes or species or meaningful rule text. */
	hasMinimalRules: boolean;
}

function asString(v: unknown): string {
	if (typeof v === "string") return v.trim();
	return "";
}

function extractFromContent(content: unknown, ...keys: string[]): string[] {
	if (!content || typeof content !== "object" || Array.isArray(content))
		return [];
	const o = content as Record<string, unknown>;
	const result: string[] = [];
	for (const key of keys) {
		const val = o[key];
		if (typeof val === "string" && val.trim()) {
			result.push(val.trim());
		}
		if (Array.isArray(val)) {
			for (const item of val) {
				if (typeof item === "string" && item.trim()) result.push(item.trim());
			}
		}
	}
	return result;
}

/**
 * Fetch character creation rules from the campaign.
 * Queries subclasses, backgrounds, rules, and house_rule entities.
 */
export async function fetchCharacterCreationRules(
	campaignId: string,
	daoFactory: DAOFactory
): Promise<FetchCharacterRulesResult> {
	const entityDAO = daoFactory.entityDAO;

	const classes = new Set<string>();
	const species = new Set<string>();
	const ruleExcerpts: string[] = [];

	const entityTypes = [
		"subclasses",
		"backgrounds",
		"rules",
		"house_rule",
	] as const;

	for (const entityType of entityTypes) {
		const entities = await entityDAO.listEntitiesByCampaign(campaignId, {
			entityType,
			excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
			limit: 50,
			offset: 0,
			orderBy: "name",
		});

		for (const entity of entities) {
			const content =
				entity.content && typeof entity.content === "object"
					? (entity.content as Record<string, unknown>)
					: {};

			if (entityType === "subclasses") {
				const parentClass = asString(content.parent_class);
				if (parentClass) classes.add(parentClass);
				const subclassName = asString(entity.name);
				if (subclassName) classes.add(subclassName);
			}

			if (entityType === "backgrounds") {
				// Background names can inform character creation; not classes/species
				// but we include rule text if relevant
				const text = asString(content.text) || asString(content.summary);
				if (text && /character|creation|background/i.test(text)) {
					ruleExcerpts.push(`[${entity.name}]: ${text.slice(0, 400)}`);
				}
			}

			if (entityType === "rules" || entityType === "house_rule") {
				const text = asString(content.text) || asString(content.summary);
				const name = asString(entity.name);
				const category = asString(content.category).toLowerCase();

				const isCharacterRelevant =
					/character|class|species|race|ancestry|creation|level|ability/i.test(
						`${name} ${text} ${category}`
					);

				if (text && isCharacterRelevant) {
					ruleExcerpts.push(`[${name}]: ${text.slice(0, 500)}`);
				}

				// Some rules explicitly list species/races
				if (isCharacterRelevant) {
					const speciesCandidates = extractFromContent(
						content,
						"species",
						"races",
						"ancestries"
					);
					for (const s of speciesCandidates) {
						// May be comma-separated
						s.split(/[,;]/).forEach((part) => {
							const trimmed = part.trim();
							if (trimmed.length >= 2) species.add(trimmed);
						});
					}
				}
			}
		}
	}

	// Also check existing PCs for class/race hints (campaign may use custom terms)
	const pcs = await entityDAO.listEntitiesByCampaign(campaignId, {
		entityType: "pcs",
		excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
		limit: 30,
		orderBy: "name",
	});

	for (const pc of pcs) {
		const content =
			pc.content && typeof pc.content === "object"
				? (pc.content as Record<string, unknown>)
				: {};
		const pcClass = asString(content.characterClass ?? content.class);
		const pcRace = asString(
			content.characterRace ?? content.race ?? content.species
		);
		if (pcClass) classes.add(pcClass);
		if (pcRace) species.add(pcRace);
	}

	const rules: CharacterCreationRules = {
		classes: [...classes],
		species: [...species],
		ruleExcerpts: ruleExcerpts.join("\n\n").slice(0, MAX_RULE_EXCERPTS_CHARS),
	};

	const hasMinimalRules =
		rules.classes.length > 0 ||
		rules.species.length > 0 ||
		rules.ruleExcerpts.length > 100;

	return { rules, hasMinimalRules };
}
