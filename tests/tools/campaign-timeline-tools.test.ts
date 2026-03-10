import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignRole: vi.fn(),
	},
	sessionDigestDAO: {
		getSessionDigestsByCampaign: vi.fn(),
	},
	worldStateChangelogDAO: {
		listEntriesForCampaign: vi.fn(),
	},
};

const recordChangelogMock = vi.fn();
const listChangelogsMock = vi.fn();
const getArchivedEntriesMock = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/graph/world-state-changelog-service", () => ({
	WorldStateChangelogService: class {
		recordChangelog = recordChangelogMock;
		listChangelogs = listChangelogsMock;
	},
}));

vi.mock("@/services/graph/changelog-archive-service", () => ({
	ChangelogArchiveService: class {
		getArchivedEntries = getArchivedEntriesMock;
	},
}));

import type { ToolResult } from "@/app-constants";
import {
	addTimelineEventTool,
	buildTimelineTool,
	queryTimelineRangeTool,
} from "@/tools/campaign-context/timeline-tools";
import type { ToolExecuteOptions } from "@/tools/utils";

describe("campaign timeline tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			id: "campaign-1",
			name: "Curse of Strahd",
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("owner");
		mockDaoFactory.sessionDigestDAO.getSessionDigestsByCampaign.mockResolvedValue(
			[]
		);
		listChangelogsMock.mockResolvedValue([]);
		getArchivedEntriesMock.mockResolvedValue([]);
		recordChangelogMock.mockResolvedValue({
			id: "changelog-manual-1",
			timestamp: "2026-03-01T10:00:00.000Z",
			campaignSessionId: 6,
		});
	});

	it("builds timeline from digest + live changelog + archived changelog", async () => {
		mockDaoFactory.sessionDigestDAO.getSessionDigestsByCampaign.mockResolvedValue(
			[
				{
					id: "digest-1",
					sessionNumber: 5,
					sessionDate: "2026-02-01T00:00:00.000Z",
					createdAt: "2026-02-01T01:00:00.000Z",
					digestData: {
						last_session_recap: {
							key_events: ["Party reached Vallaki"],
							state_changes: { factions: [], locations: [], npcs: [] },
							open_threads: ["Missing bones mystery"],
						},
					},
				},
			]
		);
		listChangelogsMock.mockResolvedValue([
			{
				id: "live-1",
				campaignSessionId: 6,
				timestamp: "2026-02-05T00:00:00.000Z",
				payload: {
					campaign_session_id: 6,
					timestamp: "2026-02-05T00:00:00.000Z",
					entity_updates: [{ entity_id: "npc-1", status: "missing" }],
					relationship_updates: [],
					new_entities: [],
				},
			},
		]);
		getArchivedEntriesMock.mockResolvedValue([
			{
				id: "arch-1",
				campaignSessionId: 4,
				timestamp: "2026-01-15T00:00:00.000Z",
				payload: {
					campaign_session_id: 4,
					timestamp: "2026-01-15T00:00:00.000Z",
					entity_updates: [],
					relationship_updates: [],
					new_entities: [],
					metadata: {
						source: "timeline_manual",
						title: "Festival decree",
						description: "Baron announced mandatory festival attendance.",
					},
				},
			},
		]);

		const result = (await buildTimelineTool.execute!(
			{
				campaignId: "campaign-1",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
				includeArchived: true,
			},
			{
				toolCallId: "timeline-build-1",
				messages: [],
				env: { DB: {}, R2: {} },
			} as ToolExecuteOptions
		)) as ToolResult;

		expect(result.result.success).toBe(true);
		const buildData = result.result.data as {
			timeline: { totalEvents: number; groups: unknown[] };
		};
		expect(buildData.timeline.totalEvents).toBe(3);
		expect(buildData.timeline.groups.length).toBeGreaterThan(0);
	});

	it("queries timeline with pagination", async () => {
		mockDaoFactory.sessionDigestDAO.getSessionDigestsByCampaign.mockResolvedValue(
			[
				{
					id: "digest-1",
					sessionNumber: 1,
					sessionDate: "2026-01-01T00:00:00.000Z",
					createdAt: "2026-01-01T00:00:00.000Z",
					digestData: {
						last_session_recap: {
							key_events: ["A"],
							state_changes: { factions: [], locations: [], npcs: [] },
							open_threads: [],
						},
					},
				},
			]
		);
		listChangelogsMock.mockResolvedValue([
			{
				id: "live-1",
				campaignSessionId: 2,
				timestamp: "2026-01-02T00:00:00.000Z",
				payload: {
					campaign_session_id: 2,
					timestamp: "2026-01-02T00:00:00.000Z",
					entity_updates: [{ entity_id: "npc-2" }],
					relationship_updates: [],
					new_entities: [],
				},
			},
		]);
		getArchivedEntriesMock.mockResolvedValue([
			{
				id: "arch-1",
				campaignSessionId: 3,
				timestamp: "2026-01-03T00:00:00.000Z",
				payload: {
					campaign_session_id: 3,
					timestamp: "2026-01-03T00:00:00.000Z",
					entity_updates: [],
					relationship_updates: [],
					new_entities: [],
				},
			},
		]);

		const result = (await queryTimelineRangeTool.execute!(
			{
				campaignId: "campaign-1",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
				limit: 1,
				offset: 1,
				includeArchived: true,
			},
			{
				toolCallId: "timeline-query-1",
				messages: [],
				env: { DB: {}, R2: {} },
			} as ToolExecuteOptions
		)) as ToolResult;

		expect(result.result.success).toBe(true);
		const queryData = result.result.data as {
			pagination: { total: number };
			events: unknown[];
		};
		expect(queryData.pagination.total).toBe(3);
		expect(queryData.events).toHaveLength(1);
	});

	it("stores manual timeline events using changelog metadata markers", async () => {
		const result = (await addTimelineEventTool.execute!(
			{
				campaignId: "campaign-1",
				title: "Iron throne coup",
				description: "A faction seized control outside normal session notes.",
				campaignSessionId: 6,
				entityIds: ["faction_iron_throne"],
				tags: ["politics", "coup"],
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{
				toolCallId: "timeline-add-1",
				messages: [],
				env: { DB: {} },
			} as ToolExecuteOptions
		)) as ToolResult;

		expect(recordChangelogMock).toHaveBeenCalledWith(
			"campaign-1",
			expect.objectContaining({
				campaign_session_id: 6,
				entity_updates: [],
				relationship_updates: [],
				new_entities: [],
				metadata: expect.objectContaining({
					source: "timeline_manual",
					title: "Iron throne coup",
					entityIds: ["faction_iron_throne"],
				}),
			})
		);
		expect(result.result.success).toBe(true);
	});
});
