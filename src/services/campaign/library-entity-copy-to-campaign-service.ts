import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { normalizeRelationshipType } from "@/lib/entity/relationship-types";
import {
	buildLibraryContentFingerprint,
	buildLibraryEntityMergeKey,
} from "@/lib/library-entity-id";
import { notifyCampaignMembers } from "@/lib/notifications";
import type { Env } from "@/middleware/auth";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";

export interface CopyLibraryEntitiesOptions {
	env: Env;
	username: string;
	campaignId: string;
	campaignName: string;
	resourceId: string;
	fileKey: string;
	fileName: string;
	attribution?: { proposedBy: string; approvedBy: string };
}

/**
 * If library discovery is complete and the file fingerprint still matches, insert staged
 * entities and relationships into the campaign graph (same shape as post-extraction staging).
 *
 * Returns `false` when discovery is missing, incomplete, or fingerprint drifted — callers
 * should call `ensureLibraryDiscoveryAndMarkResourcePending` (see `pending-campaign-entity-copy`) so library discovery runs and the resource stays pending until copy succeeds.
 */
export async function tryCopyLibraryEntitiesToCampaign(
	options: CopyLibraryEntitiesOptions
): Promise<boolean> {
	const {
		env,
		username,
		campaignId,
		campaignName,
		resourceId,
		fileKey,
		fileName,
		attribution,
	} = options;

	const libDao = new LibraryEntityDAO(env.DB);
	if (!(await libDao.isSchemaReady())) {
		return false;
	}

	const discovery = await libDao.getDiscovery(fileKey);
	if (!discovery || discovery.status !== "complete") {
		return false;
	}

	const daoFactory = getDAOFactory(env);
	const fileRecord = await daoFactory.fileDAO.getFileForRag(fileKey, username);
	if (!fileRecord || fileRecord.status !== "completed") {
		return false;
	}

	const fp = buildLibraryContentFingerprint(
		fileRecord.file_size,
		fileRecord.updated_at
	);
	if (
		discovery.content_fingerprint != null &&
		discovery.content_fingerprint !== fp
	) {
		return false;
	}

	const candidates = await libDao.listCandidatesForFile(fileKey);
	if (candidates.length === 0) {
		return false;
	}

	const extractionIdToCampaignId = new Map<string, string>();
	for (const c of candidates) {
		const newId = `${campaignId}_${c.id_suffix}`;
		extractionIdToCampaignId.set(c.extraction_entity_id, newId);
	}

	for (const c of candidates) {
		const newId = `${campaignId}_${c.id_suffix}`;
		const existing = await daoFactory.entityDAO.getEntityById(newId);
		if (existing) {
			continue;
		}
		const content = c.content ? JSON.parse(c.content) : undefined;
		const metaBase = c.metadata
			? (JSON.parse(c.metadata) as Record<string, unknown>)
			: {};
		const entityMetadata: Record<string, unknown> = {
			...metaBase,
			shardStatus: "staging",
			staged: true,
			resourceId,
			resourceName: fileName,
			fileKey,
			copiedFromLibrary: true,
			libraryMergeKey: buildLibraryEntityMergeKey(c.entity_type, c.name),
			...(attribution && {
				proposedBy: attribution.proposedBy,
				approvedBy: attribution.approvedBy,
			}),
		};

		await daoFactory.entityDAO.createEntity({
			id: newId,
			campaignId,
			entityType: c.entity_type,
			name: c.name,
			content,
			shardStatus: "staging",
			metadata: entityMetadata,
			confidence: c.confidence,
			sourceType: "file_upload",
			sourceId: resourceId,
		});
	}

	const rels = await libDao.listRelationshipsForFile(fileKey);
	const graphService = new EntityGraphService(daoFactory.entityDAO);
	for (const r of rels) {
		const fromId =
			extractionIdToCampaignId.get(r.from_extraction_entity_id) ??
			r.from_extraction_entity_id;
		const toId =
			extractionIdToCampaignId.get(r.to_extraction_entity_id) ??
			r.to_extraction_entity_id;
		if (fromId === toId) continue;
		try {
			await graphService.upsertEdge({
				campaignId,
				fromEntityId: fromId,
				toEntityId: toId,
				relationshipType: normalizeRelationshipType(r.relationship_type),
				strength: r.strength,
				metadata: r.metadata
					? {
							...(JSON.parse(r.metadata) as Record<string, unknown>),
							status: "staging",
						}
					: { status: "staging" },
				allowSelfRelation: false,
			});
		} catch {
			// skip invalid edges (missing endpoint if partial data)
		}
	}

	try {
		const importanceService = new EntityImportanceService(
			daoFactory.entityDAO,
			daoFactory.communityDAO,
			daoFactory.entityImportanceDAO
		);
		await importanceService.recalculateImportanceForCampaign(campaignId);
	} catch {
		// non-fatal
	}

	try {
		const newForApproval = candidates.length;
		await notifyCampaignMembers(
			env,
			campaignId,
			campaignName,
			() => ({
				type: NOTIFICATION_TYPES.SHARDS_GENERATED,
				title: "New shards ready",
				message: `🎉 ${newForApproval} new shard${newForApproval === 1 ? "" : "s"} from your library file "${fileName}" are ready for approval.`,
				data: {
					campaignName,
					fileName,
					shardCount: newForApproval,
					campaignId,
					resourceId,
					ui_hint: {
						type: "shards_ready",
						data: {
							campaignId,
							resourceId,
							groups: undefined,
						},
					},
				},
			}),
			[]
		);
	} catch {
		// non-fatal
	}

	return true;
}
