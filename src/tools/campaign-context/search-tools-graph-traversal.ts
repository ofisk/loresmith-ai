/**
 * Graph traversal for searchCampaignContext: walks the entity graph from a set
 * of starting entities and renders each neighbor as a search result whose text
 * is prefixed with its verified relationships.
 */
import type { getDAOFactory } from "@/dao/dao-factory";
import { isEntityStub } from "@/lib/entity/entity-content-merge";
import { sanitizeEntityContentForPlayer } from "@/lib/entity/entity-content-sanitizer";
import type { SearchResult } from "./search-tools-result-shaping";

type DAOFactory = ReturnType<typeof getDAOFactory>;
type GraphService = DAOFactory["entityGraphService"];
type Neighbor = Awaited<ReturnType<GraphService["getNeighbors"]>>[number];
type Relationship = Awaited<
	ReturnType<GraphService["getRelationshipsForEntity"]>
>[number];
type Entity = Awaited<
	ReturnType<DAOFactory["entityDAO"]["listEntitiesByCampaign"]>
>[number];

type RelationshipSummary = {
	relationshipType: string;
	direction: "outgoing" | "incoming";
	otherEntityId: string;
	otherEntityName: string;
};

const DIVIDER = "═══════════════════════════════════════════════════════\n";

/** Traverses from every starting entity, keeping the first sighting of each neighbor. */
async function gatherNeighbors(
	graphService: GraphService,
	campaignId: string,
	startEntityIds: string[],
	options: { maxDepth: number; relationshipTypes?: string[] }
): Promise<Map<string, { neighbor: Neighbor; sourceEntityId: string }>> {
	const seen = new Map<
		string,
		{ neighbor: Neighbor; sourceEntityId: string }
	>();

	for (const entityId of startEntityIds) {
		let neighbors: Neighbor[];
		try {
			neighbors = await graphService.getNeighbors(campaignId, entityId, {
				maxDepth: options.maxDepth,
				relationshipTypes: options.relationshipTypes as any,
			});
		} catch {
			// A single unreachable starting entity should not abort the traversal.
			continue;
		}
		for (const neighbor of neighbors) {
			if (!seen.has(neighbor.entityId)) {
				seen.set(neighbor.entityId, { neighbor, sourceEntityId: entityId });
			}
		}
	}

	return seen;
}

function isApprovedEntity(entity: Entity): boolean {
	try {
		const metadata = entity.metadata
			? (JSON.parse(entity.metadata as string) as Record<string, unknown>)
			: {};
		return (
			metadata.shardStatus !== "rejected" &&
			metadata.ignored !== true &&
			metadata.rejected !== true &&
			!isEntityStub({ metadata })
		);
	} catch {
		return true; // Include if metadata parsing fails.
	}
}

async function fetchRelationships(
	graphService: GraphService,
	campaignId: string,
	entities: Entity[]
): Promise<{
	byEntityId: Map<string, Relationship[]>;
	relatedEntityIds: Set<string>;
}> {
	const byEntityId = new Map<string, Relationship[]>();
	const relatedEntityIds = new Set<string>();

	await Promise.all(
		entities.map(async (entity) => {
			try {
				const relationships = await graphService.getRelationshipsForEntity(
					campaignId,
					entity.id
				);
				byEntityId.set(entity.id, relationships);
				for (const rel of relationships) {
					relatedEntityIds.add(
						rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId
					);
				}
			} catch {
				byEntityId.set(entity.id, []);
			}
		})
	);

	return { byEntityId, relatedEntityIds };
}

async function fetchEntityNames(
	daoFactory: DAOFactory,
	campaignId: string,
	entityIds: string[]
): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	if (entityIds.length === 0) return names;

	const wanted = new Set(entityIds);
	const entities = await daoFactory.entityDAO.listEntitiesByCampaign(
		campaignId,
		{
			limit: 1000,
			entityIds,
		}
	);
	for (const entity of entities) {
		if (wanted.has(entity.id)) names.set(entity.id, entity.name);
	}
	return names;
}

function summarizeRelationships(
	entityId: string,
	relationships: Relationship[],
	relatedNames: Map<string, string>
): RelationshipSummary[] {
	return relationships.map((rel) => {
		const otherEntityId =
			rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId;
		return {
			relationshipType: rel.relationshipType,
			direction: rel.fromEntityId === entityId ? "outgoing" : "incoming",
			otherEntityId,
			otherEntityName: relatedNames.get(otherEntityId) || otherEntityId,
		};
	});
}

function groupByType(
	summary: RelationshipSummary[]
): Map<string, RelationshipSummary[]> {
	const grouped = new Map<string, RelationshipSummary[]>();
	for (const rel of summary) {
		const existing = grouped.get(rel.relationshipType);
		if (existing) {
			existing.push(rel);
		} else {
			grouped.set(rel.relationshipType, [rel]);
		}
	}
	return grouped;
}

/**
 * Renders verified graph relationships ahead of the entity's own content, so the
 * model does not infer connections from prose that was never validated.
 */
function buildRelationshipHeader(options: {
	entityName: string;
	summary: RelationshipSummary[];
	sourceEntityName: string;
	depth: number;
}): string {
	const { entityName, summary, sourceEntityName, depth } = options;

	let header = `${DIVIDER}EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n${DIVIDER}`;
	header += `Found via graph traversal from "${sourceEntityName}" at depth ${depth}.\n`;
	header +=
		"CRITICAL: Use ONLY these relationships. Do NOT infer relationships from the entity content text below.\n\n";

	if (summary.length === 0) {
		header +=
			"NONE - This entity has no relationships in the entity graph.\n" +
			"Do NOT infer relationships from content text below. Any relationship mentions in content are NOT verified.\n\n";
	} else {
		for (const [relationshipType, rels] of groupByType(summary)) {
			header += `${relationshipType.toUpperCase()}:\n`;
			for (const rel of rels) {
				const verb =
					rel.direction === "outgoing"
						? `${entityName} ${relationshipType}`
						: `${entityName} is related via ${relationshipType} (incoming)`;
				header += `  ${verb} ${rel.otherEntityName}\n`;
			}
			header += "\n";
		}
	}

	return `${header}${DIVIDER}ENTITY CONTENT (may contain unverified mentions):\n${DIVIDER}`;
}

/**
 * Returns traversed neighbors as search results. Traversal is best-effort: any
 * failure yields the results gathered so far rather than failing the search.
 */
export async function collectTraversedEntityResults(options: {
	daoFactory: DAOFactory;
	campaignId: string;
	traverseFromEntityIds: string[];
	traverseDepth: number;
	traverseRelationshipTypes?: string[];
	shouldSanitizeForPlayer: boolean;
}): Promise<SearchResult[]> {
	const {
		daoFactory,
		campaignId,
		traverseFromEntityIds,
		traverseDepth,
		traverseRelationshipTypes,
		shouldSanitizeForPlayer,
	} = options;

	const graphService = daoFactory.entityGraphService;
	const results: SearchResult[] = [];

	try {
		const traversed = await gatherNeighbors(
			graphService,
			campaignId,
			traverseFromEntityIds,
			{
				maxDepth: traverseDepth,
				relationshipTypes: traverseRelationshipTypes?.map((type) =>
					type.toLowerCase().replace(/\s+/g, "_")
				),
			}
		);
		if (traversed.size === 0) return results;

		const entities = await daoFactory.entityDAO.listEntitiesByCampaign(
			campaignId,
			{
				entityIds: Array.from(traversed.keys()),
				limit: 1000,
				excludeShardStatuses: ["rejected", "deleted"],
			}
		);
		const approved = entities.filter(isApprovedEntity);

		const { byEntityId, relatedEntityIds } = await fetchRelationships(
			graphService,
			campaignId,
			approved
		);
		const relatedNames = await fetchEntityNames(
			daoFactory,
			campaignId,
			Array.from(relatedEntityIds)
		);
		const sourceNames = await fetchEntityNames(
			daoFactory,
			campaignId,
			traverseFromEntityIds
		);

		for (const entity of approved) {
			const traversalInfo = traversed.get(entity.id);
			const relationships = byEntityId.get(entity.id) || [];
			const summary = summarizeRelationships(
				entity.id,
				relationships,
				relatedNames
			);

			const sourceEntityId = traversalInfo?.sourceEntityId;
			const sourceEntityName = sourceEntityId
				? sourceNames.get(sourceEntityId) || sourceEntityId
				: "unknown";
			const depth = traversalInfo?.neighbor.depth || 1;

			const content =
				shouldSanitizeForPlayer &&
				entity.content &&
				typeof entity.content === "object" &&
				!Array.isArray(entity.content)
					? sanitizeEntityContentForPlayer(
							entity.content as Record<string, unknown>,
							entity.entityType
						)
					: entity.content;

			results.push({
				type: "entity",
				source: "graph_traversal",
				entityType: entity.entityType,
				title: entity.name,
				text:
					buildRelationshipHeader({
						entityName: entity.name,
						summary,
						sourceEntityName,
						depth,
					}) + JSON.stringify(content),
				score: 0.7 - depth * 0.1, // Lower score for deeper traversal.
				entityId: entity.id,
				filename: entity.name,
				relationships: summary,
				relationshipCount: relationships.length,
				traversalDepth: depth,
				traversedFrom: sourceEntityName,
			});
		}
	} catch {
		// Traversal is supplementary; keep whatever was gathered.
	}

	return results;
}
