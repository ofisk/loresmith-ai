import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import type { SessionDigestData } from "@/types/session-digest";
import type { WorldStateChangelogPayload } from "@/types/world-state";
import { isMatchableName } from "./continuity-text-utils";

/** Max entities loaded for name matching. Long campaigns stay bounded. */
const MAX_ENTITIES = 2000;

/** A named slice of digest prose, so evidence can say *where* the match was. */
export interface DigestTextBlock {
	field: string;
	text: string;
}

export interface CorpusDigest {
	id: string;
	sessionNumber: number;
	sessionDate: string | null;
	createdAt: string;
	data: SessionDigestData;
	/** Every searchable string in the digest, tagged by originating field. */
	blocks: DigestTextBlock[];
}

export interface CorpusChangelogEntry {
	id: string;
	sessionNumber: number | null;
	timestamp: string;
	payload: WorldStateChangelogPayload;
}

/**
 * Everything the detectors need, loaded once per scan.
 *
 * Holding this in memory is what keeps detection out of the combinatorial
 * regime the issue warns about: each detector walks the corpus linearly rather
 * than issuing a query per entity/digest pair.
 */
export interface ContinuityCorpus {
	campaignId: string;
	/** Ascending by session number. */
	digests: CorpusDigest[];
	/** Ascending by timestamp. */
	changelog: CorpusChangelogEntry[];
	/** Entity id → display name, including ids only seen in the changelog. */
	entityNames: Map<string, string>;
	/** Adjacency from the entity graph, used to narrow candidate pairs. */
	neighbors: Map<string, Set<string>>;
	maxSessionNumber: number | null;
}

/** Pull every searchable string out of a digest, tagged with its field name. */
export function digestTextBlocks(data: SessionDigestData): DigestTextBlock[] {
	const recap = data.last_session_recap;
	const plan = data.next_session_plan;
	const groups: Array<[string, string[]]> = [
		["key_events", recap.key_events],
		["open_threads", recap.open_threads],
		["state_changes.npcs", recap.state_changes.npcs],
		["state_changes.factions", recap.state_changes.factions],
		["state_changes.locations", recap.state_changes.locations],
		["next_session_plan.beats", plan.beats],
		["next_session_plan.objectives_dm", plan.objectives_dm],
		["next_session_plan.probable_player_goals", plan.probable_player_goals],
		["next_session_plan.if_then_branches", plan.if_then_branches],
		["npcs_to_run", data.npcs_to_run],
		["locations_in_focus", data.locations_in_focus],
		["encounter_seeds", data.encounter_seeds],
		["clues_and_revelations", data.clues_and_revelations],
		["treasure_and_rewards", data.treasure_and_rewards],
	];

	const blocks: DigestTextBlock[] = [];
	for (const [field, values] of groups) {
		for (const value of values ?? []) {
			const text = typeof value === "string" ? value.trim() : "";
			if (text) blocks.push({ field, text });
		}
	}
	return blocks;
}

/**
 * Recover a display name from a campaign-scoped entity id.
 *
 * Changelog payloads normalize ids to `<campaignId>_<entityName>` (see
 * WorldStateChangelogService), so entities the graph has not yet materialized
 * are still nameable — and therefore still checkable.
 */
export function nameFromEntityId(
	campaignId: string,
	entityId: string
): string | null {
	if (!entityId) return null;
	const bare = entityId.startsWith(`${campaignId}_`)
		? entityId.slice(campaignId.length + 1)
		: entityId;
	const name = bare.replace(/[_-]+/g, " ").trim();
	return name.length > 0 ? name : null;
}

function registerName(
	names: Map<string, string>,
	entityId: string | undefined,
	name: string | null | undefined
): void {
	if (!entityId || !name) return;
	if (names.has(entityId)) return;
	if (!isMatchableName(name)) return;
	names.set(entityId, name.trim());
}

async function loadEntityNames(
	db: D1Database,
	campaignId: string,
	changelog: CorpusChangelogEntry[]
): Promise<Map<string, string>> {
	const names = new Map<string, string>();

	const entities = await getDAOFactory({
		DB: db,
	}).entityDAO.listEntitiesGraphProjectionByCampaign(campaignId, {
		limit: MAX_ENTITIES,
	});
	for (const entity of entities) {
		registerName(names, entity.id, entity.name);
	}

	// Changelog-only ids: the graph may lag behind world state updates, and a
	// contradiction about an un-materialized entity is still a contradiction.
	for (const entry of changelog) {
		for (const created of entry.payload.new_entities ?? []) {
			registerName(
				names,
				created.entity_id,
				created.name ?? nameFromEntityId(campaignId, created.entity_id)
			);
		}
		for (const update of entry.payload.entity_updates ?? []) {
			registerName(
				names,
				update.entity_id,
				nameFromEntityId(campaignId, update.entity_id)
			);
		}
	}

	return names;
}

async function loadNeighbors(
	db: D1Database,
	campaignId: string
): Promise<Map<string, Set<string>>> {
	const neighbors = new Map<string, Set<string>>();
	const edges = await getDAOFactory({
		DB: db,
	}).entityDAO.getGraphRelationshipEdgesForCampaign(campaignId);

	const link = (from: string, to: string) => {
		const existing = neighbors.get(from);
		if (existing) {
			existing.add(to);
			return;
		}
		neighbors.set(from, new Set([to]));
	};

	for (const edge of edges) {
		link(edge.fromEntityId, edge.toEntityId);
		link(edge.toEntityId, edge.fromEntityId);
	}
	return neighbors;
}

/** Load the digests, changelog and graph a scan needs, in three queries. */
export async function loadContinuityCorpus(
	db: D1Database,
	campaignId: string
): Promise<ContinuityCorpus> {
	const daoFactory = getDAOFactory({ DB: db });
	const [digestRows, changelogRows] = await Promise.all([
		daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(campaignId),
		new WorldStateChangelogDAO(db).listEntriesForCampaign(campaignId),
	]);

	const digests: CorpusDigest[] = digestRows
		.map((digest) => ({
			id: digest.id,
			sessionNumber: digest.sessionNumber,
			sessionDate: digest.sessionDate,
			createdAt: digest.createdAt,
			data: digest.digestData,
			blocks: digestTextBlocks(digest.digestData),
		}))
		.sort((left, right) => left.sessionNumber - right.sessionNumber);

	const changelog: CorpusChangelogEntry[] = changelogRows
		.map((entry) => ({
			id: entry.id,
			sessionNumber: entry.campaignSessionId,
			timestamp: entry.timestamp,
			payload: entry.payload,
		}))
		.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

	const [entityNames, neighbors] = await Promise.all([
		loadEntityNames(db, campaignId, changelog),
		loadNeighbors(db, campaignId),
	]);

	const maxSessionNumber = digests.length
		? digests[digests.length - 1].sessionNumber
		: null;

	return {
		campaignId,
		digests,
		changelog,
		entityNames,
		neighbors,
		maxSessionNumber,
	};
}
