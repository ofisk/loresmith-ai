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

const { ExperimentDAO } = await import("@/dao/experiment-dao");

let experimentDAO: InstanceType<typeof ExperimentDAO>;

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({ experimentDAO })),
}));

const { requireAdmin } = await import("@/routes/auth");
const {
	handleCreateExperiment,
	handleDeleteExperiment,
	handleGetAssignments,
	handleGetExperimentResults,
	handleListExperiments,
	handleUpdateExperiment,
} = await import("@/routes/experiments");
const { clearExperimentCache } = await import("@/services/experiment-service");

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
	} as unknown as D1Database;
}

const EXPERIMENTS_MIGRATION = readFileSync(
	join(__dirname, "../../migrations/0034_experiments.sql"),
	"utf8"
);

/** Minimal stand-in for the telemetry table the exposure writes land in. */
const TELEMETRY_SCHEMA = `
  CREATE TABLE graphrag_telemetry (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    metric_type TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metadata TEXT,
    recorded_at DATETIME DEFAULT current_timestamp
  );
`;

let db: DatabaseSync;
let d1: D1Database;

interface FakeContext {
	env: { DB: D1Database };
	userAuth?: { username: string; isAdmin: boolean; type: "user-auth" };
	req: {
		json: () => Promise<unknown>;
		param: (name: string) => string | undefined;
		query: (name: string) => string | undefined;
	};
	json: (body: unknown, status?: number) => Response;
	get: (key: string) => unknown;
}

function createContext(
	options: {
		userAuth?: { username: string; isAdmin: boolean };
		body?: unknown;
		params?: Record<string, string>;
		query?: Record<string, string>;
	} = {}
): FakeContext {
	return {
		env: { DB: d1 },
		userAuth: options.userAuth
			? { ...options.userAuth, type: "user-auth" }
			: undefined,
		req: {
			json: async () => options.body ?? {},
			param: (name) => options.params?.[name],
			query: (name) => options.query?.[name],
		},
		json: (body, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		get: () => undefined,
	};
}

async function bodyOf(response: Response): Promise<any> {
	return response.json();
}

beforeEach(async () => {
	db = new DatabaseSync(":memory:");
	db.exec(EXPERIMENTS_MIGRATION);
	db.exec(TELEMETRY_SCHEMA);
	d1 = d1Adapter(db);
	clearExperimentCache(d1);
	experimentDAO = new ExperimentDAO(d1);
});

describe("requireAdmin", () => {
	it("401s when no JWT middleware has run", async () => {
		const c = createContext();
		const next = vi.fn();

		const response = await requireAdmin(c as any, next as any);

		expect(response?.status).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});

	it("403s a non-admin and does not call the handler", async () => {
		const c = createContext({
			userAuth: { username: "alice", isAdmin: false },
		});
		const next = vi.fn();

		const response = await requireAdmin(c as any, next as any);

		expect(response?.status).toBe(403);
		expect(await bodyOf(response as Response)).toEqual({
			error: "Admin access required",
		});
		expect(next).not.toHaveBeenCalled();
	});

	it("lets an admin through", async () => {
		const c = createContext({ userAuth: { username: "ofisk", isAdmin: true } });
		const next = vi.fn().mockResolvedValue(undefined);

		const response = await requireAdmin(c as any, next as any);

		expect(response).toBeUndefined();
		expect(next).toHaveBeenCalledOnce();
	});
});

describe("GET /experiments/assignments", () => {
	beforeEach(async () => {
		await experimentDAO.upsert({ key: "killSwitch", status: "off" }, "ofisk");
		await experimentDAO.upsert({ key: "shipped", status: "on" }, "ofisk");
		clearExperimentCache(d1);
	});

	it("returns the resolved variant map and its boolean projection", async () => {
		const response = await handleGetAssignments(
			createContext({ userAuth: { username: "alice", isAdmin: false } }) as any
		);

		expect(await bodyOf(response)).toEqual({
			assignments: { killSwitch: "control", shipped: "treatment" },
			flags: { killSwitch: false, shipped: true },
		});
	});

	it("is available to non-admins", async () => {
		const response = await handleGetAssignments(
			createContext({ userAuth: { username: "alice", isAdmin: false } }) as any
		);
		expect(response.status).toBe(200);
	});

	it("records one exposure per running experiment, and none for plain flags", async () => {
		await experimentDAO.upsert(
			{ key: "split", status: "experiment", rolloutPct: 100 },
			"ofisk"
		);
		clearExperimentCache(d1);

		await handleGetAssignments(
			createContext({ userAuth: { username: "alice", isAdmin: false } }) as any
		);

		const rows = db
			.prepare(
				"SELECT metric_type, metadata FROM graphrag_telemetry WHERE metric_type = 'experiment_exposure'"
			)
			.all() as { metadata: string }[];

		// Only the `experiment`-status row is counted: an on/off flag has one arm,
		// so its exposures would carry no information.
		expect(rows).toHaveLength(1);
		expect(JSON.parse(rows[0].metadata)).toEqual({
			experiment: "split",
			variant: "treatment",
		});
	});

	it("still serves assignments when the exposure write fails", async () => {
		await experimentDAO.upsert(
			{ key: "split", status: "experiment", rolloutPct: 100 },
			"ofisk"
		);
		clearExperimentCache(d1);
		db.exec("DROP TABLE graphrag_telemetry");

		const response = await handleGetAssignments(
			createContext({ userAuth: { username: "alice", isAdmin: false } }) as any
		);

		// Losing an exposure nudges a denominator; failing the request loses the app.
		expect(response.status).toBe(200);
		expect((await bodyOf(response)).assignments.split).toBe("treatment");
	});
});

describe("admin experiment CRUD", () => {
	const admin = { username: "ofisk", isAdmin: true };

	it("creates a flag that starts off", async () => {
		const response = await handleCreateExperiment(
			createContext({
				userAuth: admin,
				body: { key: "newDashboard", description: "Try the new layout" },
			}) as any
		);

		expect(response.status).toBe(201);
		expect((await bodyOf(response)).experiment).toMatchObject({
			key: "newDashboard",
			status: "off",
			updatedBy: "ofisk",
		});
	});

	it("rejects a missing key", async () => {
		const response = await handleCreateExperiment(
			createContext({ userAuth: admin, body: { description: "no key" } }) as any
		);
		expect(response.status).toBe(400);
	});

	it("rejects an unknown status", async () => {
		const response = await handleCreateExperiment(
			createContext({
				userAuth: admin,
				body: { key: "flagA", status: "maybe" },
			}) as any
		);
		expect(response.status).toBe(400);
	});

	it("409s on a duplicate key rather than silently overwriting", async () => {
		await experimentDAO.upsert({ key: "flagA" }, "ofisk");

		const response = await handleCreateExperiment(
			createContext({ userAuth: admin, body: { key: "flagA" } }) as any
		);
		expect(response.status).toBe(409);
	});

	it("lists every flag", async () => {
		await experimentDAO.upsert({ key: "flagA" }, "ofisk");
		await experimentDAO.upsert({ key: "flagB" }, "ofisk");

		const response = await handleListExperiments(
			createContext({ userAuth: admin }) as any
		);

		expect((await bodyOf(response)).experiments.map((e: any) => e.key)).toEqual(
			["flagA", "flagB"]
		);
	});

	it("patches only the fields it is sent", async () => {
		await experimentDAO.upsert(
			{ key: "flagA", description: "keep me", status: "off" },
			"ofisk"
		);

		const response = await handleUpdateExperiment(
			createContext({
				userAuth: { username: "aniham", isAdmin: true },
				params: { key: "flagA" },
				body: { status: "experiment", rolloutPct: 30 },
			}) as any
		);

		expect((await bodyOf(response)).experiment).toMatchObject({
			description: "keep me",
			status: "experiment",
			rolloutPct: 30,
			updatedBy: "aniham",
		});
	});

	it("404s a patch to a key that does not exist, rather than creating it", async () => {
		const response = await handleUpdateExperiment(
			createContext({
				userAuth: admin,
				params: { key: "ghost" },
				body: { status: "on" },
			}) as any
		);
		expect(response.status).toBe(404);
	});

	it("deletes a flag and 404s the second time", async () => {
		await experimentDAO.upsert({ key: "flagA" }, "ofisk");

		const first = await handleDeleteExperiment(
			createContext({ userAuth: admin, params: { key: "flagA" } }) as any
		);
		const second = await handleDeleteExperiment(
			createContext({ userAuth: admin, params: { key: "flagA" } }) as any
		);

		expect(first.status).toBe(200);
		expect(second.status).toBe(404);
	});
});

describe("GET /admin/experiments/:key/results", () => {
	it("reports exposures per arm", async () => {
		const insert = db.prepare(
			"INSERT INTO graphrag_telemetry (id, metric_type, metric_value, metadata, recorded_at) VALUES (?, 'experiment_exposure', 1, ?, current_timestamp)"
		);
		for (let i = 0; i < 3; i++) {
			insert.run(
				`c${i}`,
				JSON.stringify({ experiment: "split", variant: "control" })
			);
		}
		insert.run(
			"t0",
			JSON.stringify({ experiment: "split", variant: "treatment" })
		);
		insert.run(
			"other",
			JSON.stringify({ experiment: "unrelated", variant: "control" })
		);

		const response = await handleGetExperimentResults(
			createContext({
				userAuth: { username: "ofisk", isAdmin: true },
				params: { key: "split" },
			}) as any
		);

		expect((await bodyOf(response)).exposures).toEqual([
			{ variant: "control", exposures: 3 },
			{ variant: "treatment", exposures: 1 },
		]);
	});

	it("splits a chosen outcome metric by the arm stamped on it", async () => {
		const insert = db.prepare(
			"INSERT INTO graphrag_telemetry (id, metric_type, metric_value, metadata, recorded_at) VALUES (?, 'query_latency', ?, ?, current_timestamp)"
		);
		insert.run("a", 100, JSON.stringify({ experiments: { split: "control" } }));
		insert.run("b", 200, JSON.stringify({ experiments: { split: "control" } }));
		insert.run(
			"c",
			50,
			JSON.stringify({ experiments: { split: "treatment" } })
		);
		// Recorded from a background path with no user, so no arm was stamped: it
		// must drop out of the comparison rather than be mis-attributed.
		insert.run("d", 999, JSON.stringify({ queryType: "search" }));

		const response = await handleGetExperimentResults(
			createContext({
				userAuth: { username: "ofisk", isAdmin: true },
				params: { key: "split" },
				query: { metricType: "query_latency" },
			}) as any
		);

		const body = await bodyOf(response);
		expect(body.outcomeMetric).toBe("query_latency");
		expect(body.outcomes).toEqual([
			{ variant: "control", count: 2, avg: 150, sum: 300 },
			{ variant: "treatment", count: 1, avg: 50, sum: 50 },
		]);
	});

	it("omits outcomes when no metric was named", async () => {
		const response = await handleGetExperimentResults(
			createContext({
				userAuth: { username: "ofisk", isAdmin: true },
				params: { key: "split" },
			}) as any
		);

		const body = await bodyOf(response);
		expect(body.outcomes).toBeUndefined();
		expect(body.exposures).toEqual([]);
	});
});
