import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import {
	ENTITY_TYPE_HOOKS,
	ENTITY_TYPE_ITEMS,
	ENTITY_TYPE_MONSTERS,
	ENTITY_TYPE_NPCS,
} from "@/lib/entity/entity-type-constants";
import { RulesContextService } from "@/services/campaign/rules-context-service";
import type {
	RunsheetCastMember,
	RunsheetData,
	RunsheetEncounter,
	RunsheetLootItem,
	RunsheetPlan,
	RunsheetPlanItem,
	RunsheetRecap,
	RunsheetRule,
	RunsheetSectionKey,
	RunsheetThread,
} from "@/types/runsheet";
import type { SessionDigestWithData } from "@/types/session-digest";

/**
 * Entity rows loaded per type when enriching a runsheet. Campaigns rarely exceed
 * this; the cap exists so one pathological campaign cannot blow the request up.
 */
const ENTITY_LOOKUP_LIMIT = 500;

/** Hook entities appended to open threads beyond what the digest already lists. */
const MAX_GRAPH_HOOKS = 10;

/** Shard states whose entities are not yet (or no longer) part of the campaign. */
const EXCLUDED_SHARD_STATUSES = ["staging", "rejected", "deleted"];

function asText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) {
		return value
			.map((item) => asText(item))
			.filter(Boolean)
			.join("; ");
	}
	return "";
}

function contentOf(entity: Entity): Record<string, unknown> {
	if (
		entity.content &&
		typeof entity.content === "object" &&
		!Array.isArray(entity.content)
	) {
		return entity.content as Record<string, unknown>;
	}
	return {};
}

/** First non-empty stringified field, in preference order. */
function firstText(source: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const text = asText(source[key]);
		if (text) return text;
	}
	return "";
}

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

/**
 * Index entities by normalized name for name-based lookup.
 *
 * Digest fields such as `npcs_to_run` and `encounter_seeds` are free text the GM
 * typed — they carry names, not entity ids. Name matching is therefore the only
 * available join, and it is intentionally forgiving: an unmatched name still
 * makes it onto the runsheet, just without the enrichment.
 */
function indexByName(entities: Entity[]): Map<string, Entity> {
	const index = new Map<string, Entity>();
	for (const entity of entities) {
		const key = normalizeName(entity.name ?? "");
		if (!key || index.has(key)) continue;
		index.set(key, entity);
	}
	return index;
}

/** Exact name match, else the longest indexed name contained in the text. */
function findEntityForText(
	text: string,
	index: Map<string, Entity>
): Entity | null {
	const normalized = normalizeName(text);
	if (!normalized) return null;

	const exact = index.get(normalized);
	if (exact) return exact;

	let best: Entity | null = null;
	let bestLength = 0;
	for (const [name, entity] of index) {
		// Short names ("Rat") match too much free text to be worth guessing on.
		if (name.length < 4 || name.length <= bestLength) continue;
		if (normalized.includes(name)) {
			best = entity;
			bestLength = name.length;
		}
	}
	return best;
}

/**
 * Condense an NPC into the one line a GM can read mid-sentence: what they want,
 * then how they sound, then whatever summary exists.
 */
function buildCastHook(entity: Entity | null): string {
	if (!entity) return "";
	const content = contentOf(entity);
	const parts = [
		firstText(content, ["goals", "motivation"]),
		firstText(content, ["quirks", "voice", "mannerisms"]),
	].filter(Boolean);

	if (parts.length > 0) return parts.join(" — ");
	return firstText(content, ["summary", "one_line", "description"]);
}

/** At-a-glance statblock numbers, in the order a GM reads them at the table. */
function buildStatblock(entity: Entity | null): Record<string, string> {
	if (!entity) return {};
	const content = contentOf(entity);
	const statblock: Record<string, string> = {};

	const fields: Array<[string, string[]]> = [
		["CR", ["cr", "challenge_rating"]],
		["AC", ["ac", "armor_class"]],
		["HP", ["hp", "hit_points"]],
		["Speed", ["speed"]],
	];

	for (const [label, keys] of fields) {
		const value = firstText(content, keys);
		if (value) statblock[label] = value;
	}

	return statblock;
}

function buildRecap(
	digest: SessionDigestWithData | null
): [RunsheetRecap, boolean] {
	if (!digest) {
		return [
			{
				fromSessionNumber: null,
				keyEvents: [],
				stateChanges: { factions: [], locations: [], npcs: [] },
				source: null,
			},
			true,
		];
	}

	const recapData = digest.digestData.last_session_recap;
	const recap: RunsheetRecap = {
		fromSessionNumber: digest.sessionNumber,
		keyEvents: dedupeStrings(recapData.key_events),
		stateChanges: {
			factions: dedupeStrings(recapData.state_changes.factions),
			locations: dedupeStrings(recapData.state_changes.locations),
			npcs: dedupeStrings(recapData.state_changes.npcs),
		},
		source: {
			kind: "session_digest",
			id: digest.id,
			label: `Session ${digest.sessionNumber} digest`,
		},
	};

	const isEmpty =
		recap.keyEvents.length === 0 &&
		recap.stateChanges.factions.length === 0 &&
		recap.stateChanges.locations.length === 0 &&
		recap.stateChanges.npcs.length === 0;

	return [recap, isEmpty];
}

export interface AssembleRunsheetOptions {
	campaignId: string;
	/** The upcoming session this runsheet is for. */
	sessionNumber: number;
}

/**
 * Assembles a session runsheet from content that already exists: the previous
 * session's digest, planning tasks scoped to this session, the entity graph, and
 * the campaign's active house rules.
 *
 * This makes no LLM calls by design (issue #742): every input has already been
 * generated and paid for, so the runsheet costs one round of D1 reads.
 */
export class RunsheetAssemblyService {
	/**
	 * The digest that describes the run-up to `sessionNumber`: the highest-numbered
	 * digest below it. A digest for session N holds both the recap OF session N and
	 * the plan FOR session N+1, so a single digest feeds both runsheet sections.
	 *
	 * Rejected digests are skipped — a GM who rejected a digest does not want it
	 * reappearing as their session plan.
	 */
	static selectSourceDigest(
		digests: SessionDigestWithData[],
		sessionNumber: number
	): SessionDigestWithData | null {
		const candidates = digests
			.filter((d) => d.status !== "rejected")
			.filter((d) => d.sessionNumber < sessionNumber)
			.sort((a, b) => b.sessionNumber - a.sessionNumber);

		return candidates[0] ?? null;
	}

	static async assemble(
		env: unknown,
		options: AssembleRunsheetOptions
	): Promise<RunsheetData> {
		const { campaignId, sessionNumber } = options;
		const daoFactory = getDAOFactory(env);
		const entityDAO = daoFactory.entityDAO;

		const [
			digests,
			openTasks,
			npcEntities,
			monsterEntities,
			itemEntities,
			hookEntities,
			rules,
		] = await Promise.all([
			daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(campaignId),
			daoFactory.planningTaskDAO.listByCampaign(campaignId, {
				status: ["pending", "in_progress"],
				targetSessionNumber: sessionNumber,
			}),
			entityDAO.listEntitiesByCampaign(campaignId, {
				entityType: ENTITY_TYPE_NPCS,
				excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
				limit: ENTITY_LOOKUP_LIMIT,
				orderBy: "name",
			}),
			entityDAO.listEntitiesByCampaign(campaignId, {
				entityType: ENTITY_TYPE_MONSTERS,
				excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
				limit: ENTITY_LOOKUP_LIMIT,
				orderBy: "name",
			}),
			entityDAO.listEntitiesByCampaign(campaignId, {
				entityType: ENTITY_TYPE_ITEMS,
				excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
				limit: ENTITY_LOOKUP_LIMIT,
				orderBy: "name",
			}),
			entityDAO.listEntitiesByCampaign(campaignId, {
				entityType: ENTITY_TYPE_HOOKS,
				excludeShardStatuses: EXCLUDED_SHARD_STATUSES,
				limit: MAX_GRAPH_HOOKS,
				orderBy: "updated_at",
			}),
			RulesContextService.getActiveRulesForCampaign(env, campaignId),
		]);

		const digest = RunsheetAssemblyService.selectSourceDigest(
			digests,
			sessionNumber
		);

		const [recap, recapIsEmpty] = buildRecap(digest);
		const plan = RunsheetAssemblyService.buildPlan(digest, openTasks);
		const cast = RunsheetAssemblyService.buildCast(digest, npcEntities);
		const encounters = RunsheetAssemblyService.buildEncounters(
			digest,
			monsterEntities
		);
		const loot = RunsheetAssemblyService.buildLoot(digest, itemEntities);
		const houseRules = RunsheetAssemblyService.buildRules(rules);
		const openThreads = RunsheetAssemblyService.buildOpenThreads(
			digest,
			hookEntities
		);

		const emptySections: RunsheetSectionKey[] = [];
		if (recapIsEmpty) emptySections.push("recap");
		if (
			plan.objectives.length === 0 &&
			plan.beats.length === 0 &&
			plan.openTasks.length === 0 &&
			plan.probablePlayerGoals.length === 0 &&
			plan.ifThenBranches.length === 0 &&
			plan.todoChecklist.length === 0
		) {
			emptySections.push("plan");
		}
		if (cast.length === 0) emptySections.push("cast");
		if (encounters.length === 0) emptySections.push("encounters");
		if (loot.length === 0) emptySections.push("loot");
		if (houseRules.length === 0) emptySections.push("rules");
		if (openThreads.length === 0) emptySections.push("openThreads");

		return {
			recap,
			plan,
			cast,
			encounters,
			loot,
			rules: houseRules,
			openThreads,
			notes: "",
			emptySections,
		};
	}

	static buildPlan(
		digest: SessionDigestWithData | null,
		tasks: Array<{
			id: string;
			title: string;
			description: string | null;
		}>
	): RunsheetPlan {
		const planData = digest?.digestData.next_session_plan;

		const openTasks: RunsheetPlanItem[] = tasks.map((task) => ({
			title: task.title,
			detail: task.description,
			source: {
				kind: "planning_task",
				id: task.id,
				label: "Planning task",
			},
		}));

		return {
			objectives: dedupeStrings(planData?.objectives_dm ?? []),
			probablePlayerGoals: dedupeStrings(planData?.probable_player_goals ?? []),
			beats: dedupeStrings(planData?.beats ?? []),
			ifThenBranches: dedupeStrings(planData?.if_then_branches ?? []),
			openTasks,
			todoChecklist: dedupeStrings(digest?.digestData.todo_checklist ?? []),
			source: digest
				? {
						kind: "session_digest",
						id: digest.id,
						label: `Session ${digest.sessionNumber} digest`,
					}
				: null,
		};
	}

	static buildCast(
		digest: SessionDigestWithData | null,
		npcEntities: Entity[]
	): RunsheetCastMember[] {
		const names = dedupeStrings(digest?.digestData.npcs_to_run ?? []);
		if (names.length === 0) return [];

		const index = indexByName(npcEntities);

		return names.map((name) => {
			const entity = findEntityForText(name, index);
			const content = entity ? contentOf(entity) : {};

			return {
				name: entity?.name ?? name,
				hook: buildCastHook(entity),
				role: firstText(content, ["role", "occupation"]) || null,
				secrets: firstText(content, ["secrets"]) || null,
				source: entity
					? { kind: "entity", id: entity.id, label: "Entity graph" }
					: {
							kind: "session_digest",
							id: digest?.id ?? null,
							label: "Session digest",
						},
			};
		});
	}

	static buildEncounters(
		digest: SessionDigestWithData | null,
		monsterEntities: Entity[]
	): RunsheetEncounter[] {
		const seeds = dedupeStrings(digest?.digestData.encounter_seeds ?? []);
		if (seeds.length === 0) return [];

		const index = indexByName(monsterEntities);

		return seeds.map((seed) => {
			const entity = findEntityForText(seed, index);
			const content = entity ? contentOf(entity) : {};
			const monsterSummary = firstText(content, ["summary", "one_line"]);

			return {
				// The seed is the GM's own phrasing of the encounter; keep it as the
				// heading and let the matched statblock enrich rather than replace it.
				name: seed,
				summary: monsterSummary,
				statblock: buildStatblock(entity),
				source: entity
					? {
							kind: "entity",
							id: entity.id,
							label: `Statblock: ${entity.name}`,
						}
					: {
							kind: "session_digest",
							id: digest?.id ?? null,
							label: "Encounter seed",
						},
			};
		});
	}

	static buildLoot(
		digest: SessionDigestWithData | null,
		itemEntities: Entity[]
	): RunsheetLootItem[] {
		const rewards = dedupeStrings(
			digest?.digestData.treasure_and_rewards ?? []
		);
		if (rewards.length === 0) return [];

		const index = indexByName(itemEntities);

		return rewards.map((reward) => {
			const entity = findEntityForText(reward, index);
			const content = entity ? contentOf(entity) : {};
			const rarity = firstText(content, ["rarity"]);
			const text = firstText(content, ["text", "summary", "description"]);
			const detail = [rarity ? `(${rarity})` : "", text]
				.filter(Boolean)
				.join(" ")
				.trim();

			return {
				name: reward,
				detail,
				source: entity
					? { kind: "entity", id: entity.id, label: `Item: ${entity.name}` }
					: {
							kind: "session_digest",
							id: digest?.id ?? null,
							label: "Prepared reward",
						},
			};
		});
	}

	/**
	 * Only house rules make the runsheet. Core-book rules are what the GM already
	 * owns a book for; the ones worth a line at the table are the table's own.
	 */
	static buildRules(
		rules: Array<{
			id: string;
			name: string;
			category: string;
			text: string;
			source: string;
			active: boolean;
		}>
	): RunsheetRule[] {
		return rules
			.filter((rule) => rule.source === "house" && rule.active)
			.map((rule) => ({
				name: rule.name,
				category: rule.category,
				text: rule.text,
				source: { kind: "house_rule", id: rule.id, label: "House rule" },
			}));
	}

	static buildOpenThreads(
		digest: SessionDigestWithData | null,
		hookEntities: Entity[]
	): RunsheetThread[] {
		const threads: RunsheetThread[] = [];
		const seen = new Set<string>();

		for (const text of dedupeStrings(
			digest?.digestData.last_session_recap.open_threads ?? []
		)) {
			seen.add(text.toLowerCase());
			threads.push({
				text,
				source: {
					kind: "session_digest",
					id: digest?.id ?? null,
					label: digest ? `Session ${digest.sessionNumber} digest` : null,
				},
			});
		}

		for (const entity of hookEntities) {
			const text = firstText(contentOf(entity), ["text", "summary"]);
			if (!text || seen.has(text.toLowerCase())) continue;
			seen.add(text.toLowerCase());
			threads.push({
				text,
				source: {
					kind: "entity",
					id: entity.id,
					label: entity.name ? `Hook: ${entity.name}` : "Hook",
				},
			});
		}

		return threads;
	}
}
