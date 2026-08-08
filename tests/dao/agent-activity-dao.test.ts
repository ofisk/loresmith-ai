import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AGENT_ACTIVITY_RETENTION_DAYS,
	AgentActivityDAO,
	type PendingAgentActivityWrite,
} from "@/dao/agent-activity-dao";
import { AGENT_ACTIVITY_STATUS } from "@/types/agent-activity";

function createHarness(options: { tableExists?: boolean } = {}) {
	const tableExists = options.tableExists ?? true;
	const bind = vi.fn().mockReturnThis();
	const all = vi.fn(
		async (): Promise<{ results: unknown[] }> => ({
			results: [],
		})
	);
	const run = vi.fn().mockResolvedValue({ meta: { changes: 3 } });
	const stmt = { bind, all, run, first: vi.fn().mockResolvedValue(null) };
	const prepare = vi.fn().mockReturnValue(stmt);
	const batch = vi.fn().mockResolvedValue([]);

	// hasTable() is the first query every method makes; answer it, then let the
	// per-test queueing below drive the real query.
	all.mockImplementation(async () => {
		const sql = prepare.mock.calls.at(-1)?.[0] as string;
		if (sql?.includes("sqlite_master")) {
			return { results: tableExists ? [{ name: "agent_activity" }] : [] };
		}
		return { results: queued.shift() ?? [] };
	});

	const queued: unknown[][] = [];
	const db = { prepare, batch } as unknown as D1Database;

	return {
		dao: new AgentActivityDAO(db),
		prepare,
		bind,
		run,
		batch,
		queue: (rows: unknown[]) => queued.push(rows),
		/** SQL of the last statement that was not the table-existence probe. */
		lastSql: () =>
			[...prepare.mock.calls]
				.map((call) => call[0] as string)
				.filter((sql) => !sql.includes("sqlite_master"))
				.at(-1) ?? "",
	};
}

const ROW: PendingAgentActivityWrite = {
	id: "act-1",
	username: "gm",
	agentType: "campaign",
	campaignId: "camp-1",
	sessionId: "do-1",
	actionType: "tool_call",
	toolName: "listCampaigns",
	status: AGENT_ACTIVITY_STATUS.SUCCEEDED,
	parentId: null,
	rootId: "act-1",
	startedAt: "2026-08-08T00:00:00.000Z",
	endedAt: "2026-08-08T00:00:01.000Z",
	durationMs: 1000,
	summary: { input: { campaignId: "camp-1" } },
	error: null,
};

describe("AgentActivityDAO", () => {
	let harness: ReturnType<typeof createHarness>;

	beforeEach(() => {
		vi.clearAllMocks();
		harness = createHarness();
	});

	describe("when the migration has not been applied yet", () => {
		// Merging to main deploys the Worker but not D1 migrations, and this table
		// is written from inside every agent's tool path.
		beforeEach(() => {
			harness = createHarness({ tableExists: false });
		});

		it("drops writes instead of throwing", async () => {
			await expect(harness.dao.saveMany([ROW])).resolves.toBeUndefined();
			expect(harness.batch).not.toHaveBeenCalled();
		});

		it("reads as empty", async () => {
			await expect(harness.dao.query({ username: "gm" })).resolves.toEqual([]);
			await expect(harness.dao.getTree("act-1", "gm")).resolves.toEqual([]);
			await expect(harness.dao.pruneOldRows()).resolves.toBe(0);
			await expect(harness.dao.failStaleRunningRows()).resolves.toBe(0);
		});

		it("reports zeroed counts", async () => {
			await expect(
				harness.dao.getSummaryCounts({ username: "gm" })
			).resolves.toEqual({
				total: 0,
				running: 0,
				succeeded: 0,
				failed: 0,
				byAgentType: {},
			});
		});
	});

	it("writes a whole batch in one round trip", async () => {
		await harness.dao.saveMany([ROW, { ...ROW, id: "act-2" }]);

		expect(harness.batch).toHaveBeenCalledTimes(1);
		expect(harness.batch.mock.calls[0][0]).toHaveLength(2);
		expect(harness.lastSql()).toContain("ON CONFLICT(id) DO UPDATE");
	});

	it("does not overwrite identity or start time on a second write", async () => {
		await harness.dao.saveMany([ROW]);
		const sql = harness.lastSql();

		expect(sql).toContain("status = excluded.status");
		expect(sql).toContain("ended_at = excluded.ended_at");
		expect(sql).not.toContain("started_at = excluded.started_at");
		expect(sql).not.toContain("username = excluded.username");
	});

	it("keeps an existing summary when a later write has none", async () => {
		await harness.dao.saveMany([ROW]);
		expect(harness.lastSql()).toContain(
			"summary = COALESCE(excluded.summary, agent_activity.summary)"
		);
	});

	it("skips the round trip entirely for an empty batch", async () => {
		await harness.dao.saveMany([]);
		expect(harness.batch).not.toHaveBeenCalled();
		expect(harness.prepare).not.toHaveBeenCalled();
	});

	it("always scopes reads by username", async () => {
		await harness.dao.query({ username: "gm", campaignId: "camp-1" });

		expect(harness.lastSql()).toContain("WHERE username = ?");
		expect(harness.bind).toHaveBeenCalledWith(
			"gm",
			"camp-1",
			expect.any(Number),
			expect.any(Number)
		);
	});

	it("caps the page size a caller can ask for", async () => {
		await harness.dao.query({ username: "gm", limit: 100_000 });
		const bound = harness.bind.mock.calls.at(-1) as unknown[];
		expect(bound[1]).toBe(200);
	});

	it("floors a nonsensical offset at zero", async () => {
		await harness.dao.query({ username: "gm", offset: -5 });
		const bound = harness.bind.mock.calls.at(-1) as unknown[];
		expect(bound[2]).toBe(0);
	});

	it("maps stored rows back into records, parsing the summary", async () => {
		harness.queue([
			{
				id: "act-1",
				username: "gm",
				agent_type: "campaign",
				campaign_id: "camp-1",
				session_id: "do-1",
				action_type: "tool_call",
				tool_name: "listCampaigns",
				status: "succeeded",
				parent_id: null,
				root_id: "act-1",
				started_at: "2026-08-08T00:00:00.000Z",
				ended_at: "2026-08-08T00:00:01.000Z",
				duration_ms: 1000,
				summary: '{"message":"ok"}',
				error: null,
			},
		]);

		const [record] = await harness.dao.query({ username: "gm" });

		expect(record.agentType).toBe("campaign");
		expect(record.campaignId).toBe("camp-1");
		expect(record.summary).toEqual({ message: "ok" });
	});

	it("reads a tree oldest-first, scoped to its owner", async () => {
		await harness.dao.getTree("root-1", "gm");

		expect(harness.lastSql()).toContain("WHERE root_id = ? AND username = ?");
		expect(harness.lastSql()).toContain("ORDER BY started_at ASC");
		expect(harness.bind).toHaveBeenCalledWith("root-1", "gm");
	});

	it("aggregates counts by status and by agent type", async () => {
		harness.queue([
			{ status: "succeeded", count: 4 },
			{ status: "failed", count: 1 },
			{ status: "running", count: 2 },
		]);
		harness.queue([
			{ agent_type: "campaign", count: 5 },
			{ agent_type: "rules-reference", count: 2 },
		]);

		const counts = await harness.dao.getSummaryCounts({ username: "gm" });

		expect(counts).toEqual({
			total: 7,
			running: 2,
			succeeded: 4,
			failed: 1,
			byAgentType: { campaign: 5, "rules-reference": 2 },
		});
	});

	it("prunes by age using the documented retention window", async () => {
		const deleted = await harness.dao.pruneOldRows();

		expect(deleted).toBe(3);
		expect(harness.lastSql()).toContain("DELETE FROM agent_activity");
		expect(harness.bind).toHaveBeenCalledWith(
			`-${AGENT_ACTIVITY_RETENTION_DAYS} days`
		);
	});

	it("closes out rows stranded running by a dead Worker", async () => {
		await harness.dao.failStaleRunningRows(30);

		expect(harness.lastSql()).toContain("UPDATE agent_activity");
		expect(harness.bind).toHaveBeenCalledWith(
			"failed",
			expect.any(String),
			"running",
			"-30 minutes"
		);
	});
});
