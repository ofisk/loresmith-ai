import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// These modules pull in the cloudflare: protocol, which Vitest cannot load.
vi.mock("agents", () => ({
	routeAgentRequest: () =>
		Promise.resolve(new Response("Not found", { status: 404 })),
}));
vi.mock("@/durable-objects", () => ({
	Chat: class {},
	NotificationHub: class {},
}));
vi.mock("@/durable-objects/chat", () => ({ Chat: class {} }));
vi.mock("@/durable-objects/upload-session", () => ({
	UploadSessionDO: class {},
}));

const { AgentActivityDAO } = await import("@/dao/agent-activity-dao");

let agentActivityDAO: InstanceType<typeof AgentActivityDAO>;

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({ agentActivityDAO })),
}));

const {
	handleGetAgentActivitySummary,
	handleGetAgentActivityTree,
	handleListAgentActivity,
} = await import("@/routes/agent-activity");

function d1Adapter(db: DatabaseSync): D1Database {
	return {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					return {
						all: async () => ({
							results: db.prepare(sql).all(...(params as [])),
						}),
						first: async () => db.prepare(sql).get(...(params as [])) ?? null,
						run: async () => {
							const result = db.prepare(sql).run(...(params as []));
							return { meta: { changes: Number(result.changes ?? 0) } };
						},
					};
				},
			};
		},
		// The DAO writes through db.batch(); the adapter's statements are already
		// bound, so running them in order is a faithful stand-in.
		async batch(statements: any[]) {
			return Promise.all(statements.map((statement) => statement.run()));
		},
	} as unknown as D1Database;
}

// The real migration, so the route tests fail if the schema and the queries
// ever disagree.
const ACTIVITY_MIGRATION = readFileSync(
	join(__dirname, "../../migrations/0036_agent_activity.sql"),
	"utf8"
);

let db: DatabaseSync;
let d1: D1Database;

function createContext(
	options: {
		username?: string;
		params?: Record<string, string>;
		query?: Record<string, string>;
	} = {}
) {
	return {
		env: { DB: d1 },
		userAuth: options.username
			? { username: options.username, type: "user-auth" }
			: undefined,
		req: {
			param: (name: string) => options.params?.[name],
			query: (name: string) => options.query?.[name],
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		get: () => undefined,
	};
}

let rowCounter = 0;

async function seed(overrides: Partial<Record<string, unknown>> = {}) {
	rowCounter += 1;
	const id = (overrides.id as string) ?? `act-${rowCounter}`;
	await agentActivityDAO.saveMany([
		{
			id,
			username: "gm",
			agentType: "campaign",
			campaignId: "camp-1",
			sessionId: "do-1",
			actionType: "tool_call",
			toolName: "listCampaigns",
			status: "succeeded",
			parentId: null,
			rootId: id,
			startedAt: `2026-08-0${rowCounter}T00:00:00.000Z`,
			endedAt: `2026-08-0${rowCounter}T00:00:01.000Z`,
			durationMs: 1000,
			summary: null,
			error: null,
			...(overrides as any),
		},
	]);
	return id;
}

beforeEach(async () => {
	rowCounter = 0;
	db = new DatabaseSync(":memory:");
	db.exec(ACTIVITY_MIGRATION);
	d1 = d1Adapter(db);
	agentActivityDAO = new AgentActivityDAO(d1);
});

describe("GET /api/agent-activity", () => {
	it("401s without authentication", async () => {
		const response = await handleListAgentActivity(createContext() as any);
		expect(response.status).toBe(401);
		expect(await response.json()).not.toHaveProperty("activities");
	});

	it("returns only the caller's rows", async () => {
		await seed({ username: "gm" });
		await seed({ username: "other-user" });

		const response = await handleListAgentActivity(
			createContext({ username: "gm" }) as any
		);
		const body: any = await response.json();

		expect(body.activities).toHaveLength(1);
		expect(body.activities[0].username).toBe("gm");
	});

	it("ignores a username supplied in the query string", async () => {
		// The row's username is the only authorization check on this table, so
		// accepting it as input would put every other user a parameter away.
		await seed({ username: "victim" });

		const response = await handleListAgentActivity(
			createContext({ username: "gm", query: { username: "victim" } }) as any
		);
		const body: any = await response.json();

		expect(body.activities).toEqual([]);
	});

	it("filters by campaign, agent type, and status", async () => {
		await seed({ campaignId: "camp-1", agentType: "campaign" });
		await seed({ campaignId: "camp-2", agentType: "campaign" });
		await seed({ campaignId: "camp-1", agentType: "rules-reference" });
		await seed({ campaignId: "camp-1", status: "failed" });

		const byCampaign: any = await (
			await handleListAgentActivity(
				createContext({
					username: "gm",
					query: { campaignId: "camp-1" },
				}) as any
			)
		).json();
		expect(byCampaign.activities).toHaveLength(3);

		const byAgent: any = await (
			await handleListAgentActivity(
				createContext({
					username: "gm",
					query: { agentType: "rules-reference" },
				}) as any
			)
		).json();
		expect(byAgent.activities).toHaveLength(1);

		const byStatus: any = await (
			await handleListAgentActivity(
				createContext({ username: "gm", query: { status: "failed" } }) as any
			)
		).json();
		expect(byStatus.activities).toHaveLength(1);
	});

	it("returns newest first", async () => {
		const first = await seed();
		const second = await seed();

		const body: any = await (
			await handleListAgentActivity(createContext({ username: "gm" }) as any)
		).json();

		expect(body.activities.map((a: any) => a.id)).toEqual([second, first]);
	});

	it("pages", async () => {
		await seed();
		await seed();
		await seed();

		const body: any = await (
			await handleListAgentActivity(
				createContext({
					username: "gm",
					query: { limit: "2", offset: "2" },
				}) as any
			)
		).json();

		expect(body.activities).toHaveLength(1);
	});
});

describe("GET /api/agent-activity/summary", () => {
	it("counts the window, not the page", async () => {
		await seed({ status: "succeeded" });
		await seed({ status: "failed" });
		await seed({ status: "running", agentType: "rules-reference" });

		const counts: any = await (
			await handleGetAgentActivitySummary(
				createContext({ username: "gm" }) as any
			)
		).json();

		expect(counts.total).toBe(3);
		expect(counts.succeeded).toBe(1);
		expect(counts.failed).toBe(1);
		expect(counts.running).toBe(1);
		expect(counts.byAgentType).toEqual({ campaign: 2, "rules-reference": 1 });
	});

	it("applies the same filters as the list", async () => {
		await seed({ campaignId: "camp-1" });
		await seed({ campaignId: "camp-2" });

		const counts: any = await (
			await handleGetAgentActivitySummary(
				createContext({
					username: "gm",
					query: { campaignId: "camp-1" },
				}) as any
			)
		).json();

		expect(counts.total).toBe(1);
	});
});

describe("GET /api/agent-activity/tree/:rootId", () => {
	it("returns a delegation tree oldest-first", async () => {
		const root = await seed({
			id: "root-1",
			toolName: "askAnotherAgent",
			actionType: "delegation",
		});
		await seed({
			id: "child-1",
			parentId: root,
			rootId: root,
			agentType: "rules-reference",
			toolName: "searchRules",
		});

		const body: any = await (
			await handleGetAgentActivityTree(
				createContext({ username: "gm", params: { rootId: "root-1" } }) as any
			)
		).json();

		expect(body.activities.map((a: any) => a.id)).toEqual([
			"root-1",
			"child-1",
		]);
		expect(body.activities[1].agentType).toBe("rules-reference");
	});

	it("404s for another user's tree, without confirming it exists", async () => {
		await seed({ id: "root-1", username: "other-user" });

		const response = await handleGetAgentActivityTree(
			createContext({ username: "gm", params: { rootId: "root-1" } }) as any
		);

		expect(response.status).toBe(404);
	});

	it("400s without a rootId", async () => {
		const response = await handleGetAgentActivityTree(
			createContext({ username: "gm" }) as any
		);
		expect(response.status).toBe(400);
	});
});
