import type {
	D1Database,
	R2Bucket,
	VectorizeIndex,
} from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { ChangelogArchiveService } from "@/services/graph/changelog-archive-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolEnv,
	type ToolExecuteOptions,
} from "@/tools/utils";
import type { SessionDigestWithData } from "@/types/session-digest";
import type {
	WorldStateChangelogEntry,
	WorldStateChangelogPayload,
} from "@/types/world-state";
import {
	applyTimelineFilters,
	groupBySession,
	sortTimelineEvents,
	type TimelineEvent,
} from "./timeline-utils";

interface TimelineToolRuntimeEnv extends ToolEnv {
	DB?: D1Database;
	R2?: R2Bucket;
	VECTORIZE?: VectorizeIndex;
}

const timelineFiltersSchema = z.object({
	fromDate: z
		.string()
		.optional()
		.describe("Optional start timestamp/date (ISO preferred)."),
	toDate: z
		.string()
		.optional()
		.describe("Optional end timestamp/date (ISO preferred)."),
	fromSession: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Optional minimum campaign session number."),
	toSession: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Optional maximum campaign session number."),
	entityFilter: z
		.string()
		.optional()
		.describe(
			"Optional entity id/name substring filter to narrow timeline events."
		),
	includeArchived: z
		.boolean()
		.optional()
		.default(true)
		.describe("Include archived changelog entries from R2 when available."),
});

const buildTimelineSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	...timelineFiltersSchema.shape,
});

const queryTimelineRangeSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	...timelineFiltersSchema.shape,
	limit: z
		.number()
		.int()
		.min(1)
		.max(500)
		.optional()
		.default(100)
		.describe("Maximum number of timeline events to return."),
	offset: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(0)
		.describe("Number of matching timeline events to skip."),
});

const addTimelineEventSchema = z.object({
	campaignId: commonSchemas.campaignId,
	title: z
		.string()
		.min(1)
		.describe("Short title for the manual timeline event."),
	description: z
		.string()
		.min(1)
		.describe("Detailed narrative notes for the manual timeline event."),
	campaignSessionId: z
		.number()
		.int()
		.nonnegative()
		.nullable()
		.optional()
		.describe(
			"Optional campaign session number this event belongs to. Use null for out-of-session notes."
		),
	timestamp: z
		.string()
		.optional()
		.describe("Optional event timestamp (ISO). Defaults to current time."),
	entityIds: z
		.array(z.string())
		.optional()
		.default([])
		.describe("Optional related entity IDs for filterability."),
	tags: z
		.array(z.string())
		.optional()
		.default([])
		.describe("Optional tags for grouping and search."),
	jwt: commonSchemas.jwt,
});

function inferManualEvent(entry: WorldStateChangelogEntry): boolean {
	const payload = entry.payload as unknown as {
		metadata?: { source?: string };
	};
	return payload.metadata?.source === "timeline_manual";
}

function toDigestTimelineEvents(
	digests: SessionDigestWithData[]
): TimelineEvent[] {
	return digests.map((digest) => {
		const timestamp =
			digest.sessionDate || digest.createdAt || new Date().toISOString();
		const keyEvents = digest.digestData.last_session_recap.key_events;
		const openThreads = digest.digestData.last_session_recap.open_threads;
		const stateChangeCount =
			digest.digestData.last_session_recap.state_changes.factions.length +
			digest.digestData.last_session_recap.state_changes.locations.length +
			digest.digestData.last_session_recap.state_changes.npcs.length;

		const summaryParts: string[] = [];
		if (keyEvents.length > 0)
			summaryParts.push(`Key events: ${keyEvents.slice(0, 3).join("; ")}`);
		if (openThreads.length > 0)
			summaryParts.push(`Open threads: ${openThreads.slice(0, 2).join("; ")}`);
		if (stateChangeCount > 0)
			summaryParts.push(`State changes: ${stateChangeCount}`);

		return {
			id: `digest:${digest.id}`,
			source: "session_digest",
			timestamp,
			campaignSessionId: digest.sessionNumber ?? null,
			title: `Session ${digest.sessionNumber} digest`,
			summary: summaryParts.join(" | ") || "Session digest recorded.",
			entityIds: [],
		};
	});
}

function extractChangelogEntityIds(entry: WorldStateChangelogEntry): string[] {
	const ids = new Set<string>();
	for (const update of entry.payload.entity_updates || []) {
		if (update.entity_id) ids.add(update.entity_id);
	}
	for (const rel of entry.payload.relationship_updates || []) {
		if (rel.from) ids.add(rel.from);
		if (rel.to) ids.add(rel.to);
	}
	for (const entity of entry.payload.new_entities || []) {
		if (entity.entity_id) ids.add(entity.entity_id);
	}
	const metadata = (
		entry.payload as unknown as { metadata?: { entityIds?: unknown } }
	).metadata;
	if (Array.isArray(metadata?.entityIds)) {
		for (const id of metadata.entityIds) {
			if (typeof id === "string" && id.length > 0) ids.add(id);
		}
	}
	return Array.from(ids);
}

function toChangelogTimelineEvents(
	entries: WorldStateChangelogEntry[],
	source: "world_state_live" | "world_state_archived"
): TimelineEvent[] {
	return entries.map((entry) => {
		const manual = inferManualEvent(entry);
		const metadata = (
			entry.payload as unknown as {
				metadata?: { title?: string; description?: string };
			}
		).metadata;

		const entityUpdateCount = entry.payload.entity_updates.length;
		const relationshipUpdateCount = entry.payload.relationship_updates.length;
		const newEntityCount = entry.payload.new_entities.length;
		const summary = manual
			? metadata?.description || "Manual timeline event."
			: `Entity updates: ${entityUpdateCount}, relationship updates: ${relationshipUpdateCount}, new entities: ${newEntityCount}.`;

		return {
			id: `${source}:${entry.id}`,
			source: manual ? "timeline_manual" : source,
			timestamp: entry.timestamp,
			campaignSessionId: entry.campaignSessionId,
			title:
				metadata?.title ||
				(manual
					? "Manual timeline event"
					: `World state change (${source === "world_state_archived" ? "archived" : "live"})`),
			summary,
			entityIds: extractChangelogEntityIds(entry),
		};
	});
}

async function getTimelineContext(
	env: TimelineToolRuntimeEnv,
	campaignId: string,
	options: {
		fromDate?: string;
		toDate?: string;
		fromSession?: number;
		toSession?: number;
		entityFilter?: string;
		includeArchived?: boolean;
	}
): Promise<TimelineEvent[]> {
	const daoFactory = getDAOFactory(env);

	const [sessionDigests, liveChangelogEntries] = await Promise.all([
		daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(campaignId),
		new WorldStateChangelogService({ db: env.DB! }).listChangelogs(campaignId, {
			fromTimestamp: options.fromDate,
			toTimestamp: options.toDate,
		}),
	]);

	let archivedEntries: WorldStateChangelogEntry[] = [];
	if (options.includeArchived !== false && env.R2) {
		try {
			const archiveService = new ChangelogArchiveService({
				db: env.DB!,
				r2: env.R2,
				vectorize: env.VECTORIZE as VectorizeIndex | undefined,
				openaiApiKey:
					typeof env.OPENAI_API_KEY === "string"
						? env.OPENAI_API_KEY
						: undefined,
				env,
			});
			archivedEntries = await archiveService.getArchivedEntries(campaignId, {
				fromTimestamp: options.fromDate,
				toTimestamp: options.toDate,
			});
		} catch (error) {
			console.warn(
				"[timeline-tools] Failed to load archived changelog entries:",
				error
			);
		}
	}

	const merged = [
		...toDigestTimelineEvents(sessionDigests),
		...toChangelogTimelineEvents(liveChangelogEntries, "world_state_live"),
		...toChangelogTimelineEvents(archivedEntries, "world_state_archived"),
	];

	const filtered = applyTimelineFilters(merged, {
		fromDate: options.fromDate,
		toDate: options.toDate,
		fromSession: options.fromSession,
		toSession: options.toSession,
		entityFilter: options.entityFilter,
	});

	return sortTimelineEvents(filtered);
}

async function validateCampaignAndUser(
	env: TimelineToolRuntimeEnv,
	campaignId: string,
	jwt: string | null | undefined,
	toolCallId: string
) {
	const access = await requireCampaignAccessForTool({
		env,
		campaignId,
		jwt,
		toolCallId,
	});
	if ("toolCallId" in access) {
		return { error: access, userId: null, campaignName: null } as const;
	}
	const { userId, campaign } = access;

	const gmError = await requireGMRole(env, campaignId, userId, toolCallId);
	if (gmError) {
		return { error: gmError, userId: null, campaignName: null } as const;
	}

	return { error: null, userId, campaignName: campaign.name } as const;
}

export const buildTimelineTool = tool({
	description:
		"Build a chronological campaign timeline from session digests and world state changelog data, grouped by session.",
	inputSchema: buildTimelineSchema,
	execute: async (
		input: z.infer<typeof buildTimelineSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as TimelineToolRuntimeEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for timeline building.",
					500,
					toolCallId
				);
			}

			const access = await validateCampaignAndUser(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const events = await getTimelineContext(env, input.campaignId, {
				fromDate: input.fromDate,
				toDate: input.toDate,
				fromSession: input.fromSession,
				toSession: input.toSession,
				entityFilter: input.entityFilter,
				includeArchived: input.includeArchived,
			});
			const grouped = groupBySession(events);

			return createToolSuccess(
				`Built timeline for campaign "${access.campaignName}".`,
				{
					filters: {
						fromDate: input.fromDate ?? null,
						toDate: input.toDate ?? null,
						fromSession: input.fromSession ?? null,
						toSession: input.toSession ?? null,
						entityFilter: input.entityFilter ?? null,
						includeArchived: input.includeArchived,
					},
					timeline: {
						totalEvents: events.length,
						groups: grouped,
					},
				},
				toolCallId
			);
		} catch (error) {
			console.error("[buildTimelineTool] Error:", error);
			return createToolError(
				"Failed to build timeline",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const queryTimelineRangeTool = tool({
	description:
		"Query timeline events for a campaign with date/session/entity filters and pagination.",
	inputSchema: queryTimelineRangeSchema,
	execute: async (
		input: z.infer<typeof queryTimelineRangeSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as TimelineToolRuntimeEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for timeline queries.",
					500,
					toolCallId
				);
			}

			const access = await validateCampaignAndUser(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const events = await getTimelineContext(env, input.campaignId, {
				fromDate: input.fromDate,
				toDate: input.toDate,
				fromSession: input.fromSession,
				toSession: input.toSession,
				entityFilter: input.entityFilter,
				includeArchived: input.includeArchived,
			});
			const paged = events.slice(input.offset, input.offset + input.limit);

			return createToolSuccess(
				`Queried timeline events for campaign "${access.campaignName}".`,
				{
					filters: {
						fromDate: input.fromDate ?? null,
						toDate: input.toDate ?? null,
						fromSession: input.fromSession ?? null,
						toSession: input.toSession ?? null,
						entityFilter: input.entityFilter ?? null,
					},
					pagination: {
						limit: input.limit,
						offset: input.offset,
						total: events.length,
					},
					events: paged,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[queryTimelineRangeTool] Error:", error);
			return createToolError(
				"Failed to query timeline range",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const addTimelineEventTool = tool({
	description:
		"Add a manual GM timeline event by persisting a metadata-marked world state changelog entry.",
	inputSchema: addTimelineEventSchema,
	execute: async (
		input: z.infer<typeof addTimelineEventSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as TimelineToolRuntimeEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for timeline updates.",
					500,
					toolCallId
				);
			}

			const access = await validateCampaignAndUser(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const changelogService = new WorldStateChangelogService({ db: env.DB });
			const payload: WorldStateChangelogPayload = {
				campaign_session_id: input.campaignSessionId ?? null,
				timestamp: input.timestamp ?? new Date().toISOString(),
				entity_updates: [],
				relationship_updates: [],
				new_entities: [],
			};
			(
				payload as WorldStateChangelogPayload & {
					metadata: {
						source: "timeline_manual";
						title: string;
						description: string;
						entityIds: string[];
						tags: string[];
					};
				}
			).metadata = {
				source: "timeline_manual",
				title: input.title,
				description: input.description,
				entityIds: input.entityIds,
				tags: input.tags,
			};

			const entry = await changelogService.recordChangelog(
				input.campaignId,
				payload
			);

			return createToolSuccess(
				`Added manual timeline event to campaign "${access.campaignName}".`,
				{
					event: {
						id: entry.id,
						timestamp: entry.timestamp,
						campaignSessionId: entry.campaignSessionId,
						title: input.title,
						description: input.description,
						entityIds: input.entityIds,
						tags: input.tags,
					},
				},
				toolCallId
			);
		} catch (error) {
			console.error("[addTimelineEventTool] Error:", error);
			return createToolError(
				"Failed to add timeline event",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});
