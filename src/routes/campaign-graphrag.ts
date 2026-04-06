import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { campaignHasActiveDocumentProcessing } from "@/lib/campaign-document-processing";
import {
	getRequiredFieldsForEntityType,
	isStubContentSufficient,
} from "@/lib/entity/entity-required-fields";
import { getEnvVar } from "@/lib/env-utils";
import { createLogger, getRequestLogger } from "@/lib/logger";
import { notifyCampaignMembers } from "@/lib/notifications";
import {
	type ContextWithAuth,
	requireParam,
	verifyCampaignAccess,
} from "@/lib/route-utils";
import { resolveStagedShardDisplayTitle } from "@/lib/shard/staged-entity-display-title";
import { getGraphServices } from "@/services/graph/graph-service-factory";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import { TelemetryService } from "@/services/telemetry/telemetry-service";

interface DirtyRelationshipRef {
	fromEntityId: string;
	toEntityId: string;
	relationshipType: string;
}

/**
 * Mark dirty graph state and trigger async rebuild in the background.
 */
async function checkAndRunCommunityDetection(
	daoFactory: ReturnType<typeof getDAOFactory>,
	campaignId: string,
	env: any,
	affectedEntityIds: string[],
	relationshipKeys: DirtyRelationshipRef[] = [],
	username?: string
): Promise<void> {
	const rebuildTriggerService = daoFactory.rebuildTriggerService;
	if (!daoFactory.graphRebuildDirtyDAO) {
		return;
	}
	await daoFactory.graphRebuildDirtyDAO.markEntitiesDirty(
		campaignId,
		affectedEntityIds,
		"approval_mutation"
	);
	if (relationshipKeys.length > 0) {
		await daoFactory.graphRebuildDirtyDAO.markRelationshipsDirty(
			campaignId,
			relationshipKeys,
			"approval_mutation"
		);
	}

	if (!(env as any).GRAPH_REBUILD_QUEUE) {
		return;
	}

	const processingActive = await campaignHasActiveDocumentProcessing(
		env,
		campaignId
	);
	if (processingActive) {
		// Dirty state is already recorded; scheduled rebuild cron will call
		// decideAndEnqueueRebuild once document and extraction pipelines finish.
		return;
	}

	const queueService = getGraphServices(env as any).rebuildQueue;
	const result = await rebuildTriggerService.decideAndEnqueueRebuild({
		campaignId,
		triggeredBy: username || "system",
		requestedRadius: 2,
		dirtyEntitySeedIds: affectedEntityIds,
		queueService,
	});
	if (result.enqueued) {
		const log = createLogger(env, "[GraphRAG]");
		log.info("graph_rebuild_enqueued", {
			campaignId,
			rebuildId: result.rebuildId,
			triggeredBy: username || "system",
			source: "community_detection",
		});
	}
}

// Get staged entities for a campaign (UI refers to them as "shards")
export async function handleGetStagedShards(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const userAuth = (c as any).userAuth;
		const resourceId = c.req.query("resourceId");

		// Verify campaign belongs to user
		const campaign = await verifyCampaignAccess(
			c,
			campaignId,
			userAuth.username
		);

		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const basePath = campaign.campaignRagBasePath;

		// Get all entities for the campaign with staging status
		const daoFactory = getDAOFactory(c.env);
		const stagedEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
			campaignId,
			{
				shardStatus: "staging",
				resourceId: resourceId || undefined,
			}
		);

		// Group entities by resourceId to match StagedShardGroup interface (UI compatibility)
		const groupedByResource = new Map<
			string,
			{
				key: string;
				sourceRef: any;
				shards: any[]; // UI uses "shards" terminology
				created_at: string;
				campaignRagBasePath: string;
			}
		>();

		for (const entity of stagedEntities) {
			const metadata = (entity.metadata as Record<string, unknown>) || {};
			const resourceId = (metadata.resourceId as string) || "unknown";
			const resourceName = (metadata.resourceName as string) || "unknown";
			const fileKey = (metadata.fileKey as string) || resourceId;

			if (!groupedByResource.has(resourceId)) {
				groupedByResource.set(resourceId, {
					key: `entity_staging_${resourceId}`,
					sourceRef: {
						fileKey,
						meta: {
							fileName: resourceName,
							campaignId,
							entityType: entity.entityType,
							chunkId: "",
							score: 0,
							...(metadata.proposedBy && metadata.approvedBy
								? {
										proposedBy: metadata.proposedBy,
										approvedBy: metadata.approvedBy,
									}
								: {}),
						},
					},
					shards: [], // UI uses "shards" terminology
					created_at: entity.createdAt,
					campaignRagBasePath: basePath,
				});
			}

			// Convert entity to shard format for UI compatibility (UI uses "shard" terminology)
			const shardTitle = resolveStagedShardDisplayTitle({
				name: entity.name,
				entityType: entity.entityType,
				content: entity.content,
				metadata,
			});
			const shard = {
				id: entity.id,
				name: shardTitle, // Include name so UI doesn't fall back to showing the ID
				title: shardTitle, // Also include as title for maximum compatibility
				text: JSON.stringify(entity.content),
				metadata: {
					...metadata,
					entityType: entity.entityType,
					confidence: entity.confidence || 0.9,
					importanceScore: metadata.importanceScore,
					importanceOverride: metadata.importanceOverride,
					isStub: metadata.isStub === true,
				},
				sourceRef: {
					fileKey,
					meta: {
						fileName: resourceName,
						campaignId,
						entityType: entity.entityType,
						chunkId: entity.id,
						score: 0,
					},
				},
			};

			groupedByResource.get(resourceId)!.shards.push(shard);
		}

		const stagedShardGroups = Array.from(groupedByResource.values());

		// Return the grouped entities in shard format for UI compatibility
		return c.json({ shards: stagedShardGroups });
	} catch (error) {
		log.error("[handleGetStagedShards] Failed to get staged entities", error);
		return c.json({ error: "Failed to get staged entities" }, 500);
	}
}

// Approve entities for a campaign (UI refers to them as "shards")
export async function handleApproveShards(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const userAuth = (c as any).userAuth;
		const { shardIds } = await c.req.json(); // UI uses "shardIds" terminology

		if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
			return c.json({ error: "shardIds array is required" }, 400);
		}

		// Verify campaign belongs to user
		const campaign = await verifyCampaignAccess(
			c,
			campaignId,
			userAuth.username
		);

		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const graphService = daoFactory.entityGraphService;
		const graphServices = getGraphServices(c.env as any);

		// Fetch only entities that exist, belong to this campaign, and are in staging (filter in SQL)
		const validEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
			campaignId,
			{ entityIds: shardIds, shardStatus: "staging" }
		);

		// Stub shards must have required fields filled; fail entire request if any are insufficient
		const insufficientStubs: Array<{
			entityId: string;
			name: string;
			missingFields: string[];
		}> = [];
		for (const entity of validEntities) {
			const meta = (entity.metadata as Record<string, unknown>) || {};
			if (
				meta.isStub === true &&
				!isStubContentSufficient(entity.content, entity.entityType)
			) {
				const required = getRequiredFieldsForEntityType(entity.entityType);
				const contentObj =
					entity.content && typeof entity.content === "object"
						? (entity.content as Record<string, unknown>)
						: {};
				const missingFields = required.filter(
					(key) =>
						contentObj[key] == null ||
						(typeof contentObj[key] === "string" &&
							(contentObj[key] as string).trim() === "")
				);
				insufficientStubs.push({
					entityId: entity.id,
					name: entity.name,
					missingFields,
				});
			}
		}
		if (insufficientStubs.length > 0) {
			return c.json(
				{
					error:
						"Some stub shards have missing required fields. Fill them before approving.",
					insufficientStubs,
				},
				400
			);
		}

		let shardApprovalNewCount = 0;
		let shardApprovalUpdateCount = 0;
		for (const entity of validEntities) {
			const meta = (entity.metadata as Record<string, unknown>) || {};
			if (meta.shardStagingOrigin === "update") {
				shardApprovalUpdateCount++;
			} else {
				shardApprovalNewCount++;
			}
		}
		if (
			c.env.DB &&
			(shardApprovalNewCount > 0 || shardApprovalUpdateCount > 0)
		) {
			void new TelemetryService(new TelemetryDAO(c.env.DB))
				.recordShardApprovalStagingOrigin({
					newCount: shardApprovalNewCount,
					updateCount: shardApprovalUpdateCount,
					campaignId,
				})
				.catch(() => {});
		}

		// Batch entity updates
		const entityUpdates = validEntities.map((entity) => {
			const metadata = (entity.metadata as Record<string, unknown>) || {};
			const { pendingRelations: _, ...metadataWithoutPending } = metadata;
			const updatedMetadata = {
				...metadataWithoutPending,
				shardStatus: "approved" as const,
				staged: false,
				approvedAt: new Date().toISOString(),
			};
			return {
				entityId: entity.id,
				metadata: updatedMetadata,
				shardStatus: "approved" as string,
			};
		});
		if (entityUpdates.length > 0) {
			await daoFactory.entityDAO.updateEntitiesBatch(entityUpdates);
		}

		const approvedCount = validEntities.length;
		const approvedEntityIds = validEntities.map((e) => e.id);
		const touchedEntityIds = new Set<string>(approvedEntityIds);
		const touchedRelationships: DirtyRelationshipRef[] = [];

		// Batch load relationships and update staging → approved
		const relationshipsMap = await graphService.getRelationshipsForEntities(
			campaignId,
			approvedEntityIds
		);
		const seenEdgeKeys = new Set<string>();
		const edgesToApprove: Array<{
			campaignId: string;
			fromEntityId: string;
			toEntityId: string;
			relationshipType: string;
			strength?: number | null;
			metadata?: unknown;
			allowSelfRelation?: boolean;
		}> = [];
		for (const rels of relationshipsMap.values()) {
			for (const rel of rels) {
				const relMetadata = (rel.metadata as Record<string, unknown>) || {};
				if (relMetadata.status === "staging") {
					const key = `${rel.fromEntityId}|${rel.toEntityId}|${rel.relationshipType}`;
					if (seenEdgeKeys.has(key)) continue;
					seenEdgeKeys.add(key);
					edgesToApprove.push({
						campaignId,
						fromEntityId: rel.fromEntityId,
						toEntityId: rel.toEntityId,
						relationshipType: rel.relationshipType,
						strength: rel.strength,
						metadata: { ...relMetadata, status: "approved" },
						allowSelfRelation: false,
					});
					touchedEntityIds.add(rel.fromEntityId);
					touchedEntityIds.add(rel.toEntityId);
					touchedRelationships.push({
						fromEntityId: rel.fromEntityId,
						toEntityId: rel.toEntityId,
						relationshipType: rel.relationshipType,
					});
				}
			}
		}
		if (edgesToApprove.length > 0) {
			await graphService.upsertEdgesBatch(edgesToApprove);
		}
		const relationshipCount = edgesToApprove.length;

		// Defer embedding generation to background queue for faster UI response
		if (
			approvedEntityIds.length > 0 &&
			graphServices.shardEmbeddingQueue &&
			c.env.VECTORIZE
		) {
			try {
				await graphServices.shardEmbeddingQueue.enqueueShardEmbedding({
					type: "shard_embedding",
					entityIds: approvedEntityIds,
					campaignId,
					username: userAuth.username,
				});
			} catch (_error) {}
		}

		const approvedEntityIdsForRebuild = Array.from(touchedEntityIds);
		if (approvedEntityIdsForRebuild.length > 0) {
			await checkAndRunCommunityDetection(
				daoFactory,
				campaignId,
				c.env as any,
				approvedEntityIdsForRebuild,
				touchedRelationships,
				userAuth.username
			);
		}

		// Notify all campaign members about entity approval (UI uses "shard" terminology)
		try {
			await notifyCampaignMembers(
				c.env as any,
				campaignId,
				campaign.name,
				() => ({
					type: NOTIFICATION_TYPES.SHARD_APPROVED,
					title: "Shards approved",
					message: `✅ ${approvedCount} shard${approvedCount === 1 ? "" : "s"} approved for "${campaign.name}".`,
					data: { campaignName: campaign.name, shardCount: approvedCount },
				}),
				[]
			);
		} catch (_error) {}

		return c.json({
			success: true,
			approvedCount,
			relationshipCount,
		});
	} catch (error) {
		log.error("[handleApproveShards] Failed to approve entities", error);
		return c.json({ error: "Failed to approve entities" }, 500);
	}
}

// Reject entities for a campaign (UI refers to them as "shards")
export async function handleRejectShards(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const userAuth = (c as any).userAuth;
		const { shardIds, reason } = await c.req.json(); // UI uses "shardIds" terminology

		if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
			return c.json({ error: "shardIds array is required" }, 400);
		}

		if (!reason) {
			return c.json({ error: "reason is required" }, 400);
		}

		// Verify campaign belongs to user
		const campaign = await verifyCampaignAccess(
			c,
			campaignId,
			userAuth.username
		);

		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const graphService = daoFactory.entityGraphService;

		// Fetch only entities that exist, belong to this campaign, and are in staging (filter in SQL)
		const validEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
			campaignId,
			{ entityIds: shardIds, shardStatus: "staging" }
		);

		// Batch entity updates
		const entityUpdates = validEntities.map((entity) => {
			const metadata = (entity.metadata as Record<string, unknown>) || {};
			const { pendingRelations: _, ...metadataWithoutPending } = metadata;
			const updatedMetadata = {
				...metadataWithoutPending,
				shardStatus: "rejected" as const,
				rejected: true,
				ignored: true,
				rejectionReason: reason,
				rejectedAt: new Date().toISOString(),
			};
			return {
				entityId: entity.id,
				metadata: updatedMetadata,
				shardStatus: "rejected" as string,
			};
		});
		if (entityUpdates.length > 0) {
			await daoFactory.entityDAO.updateEntitiesBatch(entityUpdates);
		}

		const rejectedCount = validEntities.length;
		const rejectedEntityIds = validEntities.map((e) => e.id);
		const touchedEntityIds = new Set<string>(rejectedEntityIds);
		const touchedRelationships: DirtyRelationshipRef[] = [];

		// Batch load relationships and update staging → rejected
		const relationshipsMap = await graphService.getRelationshipsForEntities(
			campaignId,
			rejectedEntityIds
		);
		const seenEdgeKeys = new Set<string>();
		const edgesToReject: Array<{
			campaignId: string;
			fromEntityId: string;
			toEntityId: string;
			relationshipType: string;
			strength?: number | null;
			metadata?: unknown;
			allowSelfRelation?: boolean;
		}> = [];
		for (const rels of relationshipsMap.values()) {
			for (const rel of rels) {
				const relMetadata = (rel.metadata as Record<string, unknown>) || {};
				if (relMetadata.status === "staging") {
					const key = `${rel.fromEntityId}|${rel.toEntityId}|${rel.relationshipType}`;
					if (seenEdgeKeys.has(key)) continue;
					seenEdgeKeys.add(key);
					edgesToReject.push({
						campaignId,
						fromEntityId: rel.fromEntityId,
						toEntityId: rel.toEntityId,
						relationshipType: rel.relationshipType,
						strength: rel.strength,
						metadata: {
							...relMetadata,
							status: "rejected",
							rejected: true,
							ignored: true,
							rejectionReason: reason,
						},
						allowSelfRelation: false,
					});
					touchedEntityIds.add(rel.fromEntityId);
					touchedEntityIds.add(rel.toEntityId);
					touchedRelationships.push({
						fromEntityId: rel.fromEntityId,
						toEntityId: rel.toEntityId,
						relationshipType: rel.relationshipType,
					});
				}
			}
		}
		if (edgesToReject.length > 0) {
			await graphService.upsertEdgesBatch(edgesToReject);
		}
		const relationshipCount = edgesToReject.length;

		const rejectedEntityIdsForRebuild = Array.from(touchedEntityIds);
		if (rejectedEntityIdsForRebuild.length > 0) {
			await checkAndRunCommunityDetection(
				daoFactory,
				campaignId,
				c.env as any,
				rejectedEntityIdsForRebuild,
				touchedRelationships,
				userAuth.username
			);
		}

		// Notify all campaign members about entity rejection (UI uses "shard" terminology)
		try {
			await notifyCampaignMembers(
				c.env as any,
				campaignId,
				campaign.name,
				() => ({
					type: NOTIFICATION_TYPES.SHARD_REJECTED,
					title: "Shards rejected",
					message: `❌ ${rejectedCount} shard${rejectedCount === 1 ? "" : "s"} rejected for "${campaign.name}"${reason ? ` (${reason})` : ""}`,
					data: {
						campaignName: campaign.name,
						shardCount: rejectedCount,
						reason,
					},
				}),
				[]
			);
		} catch (_error) {}

		return c.json({
			success: true,
			rejectedCount,
			relationshipCount,
		});
	} catch (error) {
		log.error("[handleRejectShards] Failed to reject entities", error);
		return c.json({ error: "Failed to reject entities" }, 500);
	}
}

// Update a single entity (UI refers to it as "shard")
export async function handleUpdateShard(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const shardId = requireParam(c, "shardId");
		if (shardId instanceof Response) return shardId;
		const userAuth = (c as any).userAuth;
		const { text, metadata } = await c.req.json();

		if (!text && !metadata) {
			return c.json({ error: "Either text or metadata must be provided" }, 400);
		}

		// Verify campaign belongs to user
		const campaign = await verifyCampaignAccess(
			c,
			campaignId,
			userAuth.username
		);

		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		// Update entity directly in database (entities are stored in DB, not R2)
		const daoFactory = getDAOFactory(c.env);
		const entity = await daoFactory.entityDAO.getEntityById(shardId);

		if (!entity || entity.campaignId !== campaignId) {
			return c.json({ error: "Entity not found" }, 404);
		}

		// Update entity content and metadata
		let updatedContent: unknown = entity.content;
		if (text) {
			try {
				updatedContent = JSON.parse(text);
			} catch (_parseErr) {
				return c.json({ error: "Invalid JSON in entity content" }, 400);
			}
		}
		const updatedMetadata = metadata
			? { ...(entity.metadata as Record<string, unknown>), ...metadata }
			: entity.metadata;

		await daoFactory.entityDAO.updateEntity(shardId, {
			content: updatedContent,
			metadata: updatedMetadata,
		});

		return c.json({
			success: true,
			message: "Entity updated successfully",
			shard: {
				id: entity.id,
				text: JSON.stringify(updatedContent),
				metadata: updatedMetadata,
			},
		});
	} catch (error) {
		log.error("[handleUpdateShard] Failed to update entity", error);
		return c.json({ error: "Failed to update entity" }, 500);
	}
}

/** Allowed content keys for LLM field generation (required + common). */
const GENERATABLE_FIELD_KEYS = new Set([
	"summary",
	"overview",
	"one_line",
	"objective",
	"setup",
	"premise",
	"purpose",
	"text",
	"effect",
	"trigger",
	"owner",
	"route",
	"procedure",
	"feature",
	"domains",
	"prompt",
	"solution",
	"title",
	"rows",
]);

// Generate a single field value for a stub shard via LLM
export async function handleGenerateShardField(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const shardId = requireParam(c, "shardId");
		if (shardId instanceof Response) return shardId;
		const userAuth = (c as any).userAuth;
		const body = await c.req.json().catch(() => ({}));
		const field = typeof body?.field === "string" ? body.field.trim() : "";

		if (!field) {
			return c.json({ error: "field is required" }, 400);
		}

		const campaign = await verifyCampaignAccess(
			c,
			campaignId,
			userAuth.username
		);
		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const entity = await daoFactory.entityDAO.getEntityById(shardId);
		if (!entity || entity.campaignId !== campaignId) {
			return c.json({ error: "Entity not found" }, 404);
		}

		const metadata = (entity.metadata as Record<string, unknown>) || {};
		if (metadata.shardStatus !== "staging") {
			return c.json(
				{
					error:
						"Entity is not in staging; generate-field only for pending shards",
				},
				400
			);
		}

		const allowedForType = getRequiredFieldsForEntityType(entity.entityType);
		const allowedSet = new Set([
			...allowedForType,
			...Array.from(GENERATABLE_FIELD_KEYS),
		]);
		if (!allowedSet.has(field)) {
			return c.json(
				{
					error: `Field "${field}" is not allowed for this entity type. Allowed: ${allowedForType.join(", ")}`,
				},
				400
			);
		}

		const openaiApiKeyRaw = await getEnvVar(c.env, "OPENAI_API_KEY", false);
		const openaiApiKey = openaiApiKeyRaw.trim() || undefined;
		if (!openaiApiKey) {
			return c.json({ error: "OpenAI API key not configured" }, 503);
		}

		const contentObj =
			entity.content && typeof entity.content === "object"
				? (entity.content as Record<string, unknown>)
				: {};
		const name = (entity.name || contentObj.name || shardId) as string;
		const contextParts: string[] = [];
		if (contentObj.source && typeof contentObj.source === "object") {
			contextParts.push(`Source: ${JSON.stringify(contentObj.source)}`);
		}
		const contextStr =
			contextParts.length > 0
				? `\nExisting context: ${contextParts.join("; ")}`
				: "";

		const prompt = `You are helping fill in a tabletop game master (GM) entity. Generate a brief, GM-usable value for ONE field only.

Entity name: ${name}
Entity type: ${entity.entityType}
Field to generate: "${field}"${contextStr}

Rules:
- Return ONLY the value for "${field}". No label, no prefix, no markdown.
- For summary/overview/one_line: 1-3 sentences, concise and useful for a GM.
- For one_line: a single short line (e.g. one sentence).
- For objective/setup/premise/purpose: 1-2 sentences.
- Do not invent facts not implied by the name/type; keep it generic if little context exists.`;

		const provider = createLLMProvider({
			apiKey: openaiApiKey,
			defaultMaxTokens: 500,
		});
		const rateLimitService = getLLMRateLimitService(c.env);
		const value = await provider.generateSummary(prompt, {
			username: userAuth.username,
			onUsage: async (usage) => {
				await rateLimitService.recordUsage(
					userAuth.username,
					usage.tokens,
					usage.queryCount
				);
			},
		});

		const trimmed = value?.trim() ?? "";
		return c.json({ value: trimmed });
	} catch (error) {
		log.error("[handleGenerateShardField] Failed to generate field", error);
		return c.json(
			{
				error: "Failed to generate field",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}
