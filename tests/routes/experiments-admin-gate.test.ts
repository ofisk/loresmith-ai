import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 403 criterion in issue #755 is about the *wired* route, not the handler:
 * a guard that exists but was never attached to a route still returns 200. So
 * this exercises the real `registerExperimentRoutes` -> `requireUserJwt` ->
 * `requireAdmin` chain over a real Hono app with a real signed JWT, rather than
 * calling the middleware directly.
 */
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

const JWT_SECRET = new TextEncoder().encode(
	"test-secret-value-for-experiments"
);

vi.mock("@/lib/service-factory", () => ({
	getAuthService: () => ({ getJwtSecret: async () => JWT_SECRET }),
	LibraryRAGService: class {},
}));

const { ExperimentDAO } = await import("@/dao/experiment-dao");

let experimentDAO: InstanceType<typeof ExperimentDAO>;

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({ experimentDAO })),
}));

const { registerExperimentRoutes } = await import("@/routes/experiments/index");
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

const MIGRATION = readFileSync(
	join(__dirname, "../../migrations/0034_experiments.sql"),
	"utf8"
);
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

async function signJwt(username: string, isAdmin: boolean): Promise<string> {
	return new SignJWT({ type: "user-auth", username, isAdmin })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("1h")
		.sign(JWT_SECRET);
}

let db: DatabaseSync;
let d1: D1Database;
let app: OpenAPIHono<any>;

async function call(
	method: string,
	path: string,
	token?: string,
	body?: unknown
): Promise<Response> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return app.request(`http://localhost${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

/** Every route the issue says a non-admin must be locked out of. */
const ADMIN_ROUTES: [string, string, unknown?][] = [
	["GET", "/api/admin/experiments"],
	["POST", "/api/admin/experiments", { key: "sneaky" }],
	["PATCH", "/api/admin/experiments/flagA", { status: "on" }],
	["DELETE", "/api/admin/experiments/flagA"],
	["GET", "/api/admin/experiments/flagA/results"],
];

beforeEach(async () => {
	db = new DatabaseSync(":memory:");
	db.exec(MIGRATION);
	db.exec(TELEMETRY_SCHEMA);
	d1 = d1Adapter(db);
	clearExperimentCache(d1);
	experimentDAO = new ExperimentDAO(d1);
	await experimentDAO.upsert({ key: "flagA", status: "on" }, "ofisk");
	clearExperimentCache(d1);

	app = new OpenAPIHono();
	app.use("*", async (c, next) => {
		c.env = { DB: d1 } as never;
		await next();
	});
	registerExperimentRoutes(app as never);
});

describe("admin route gate", () => {
	it.each(
		ADMIN_ROUTES
	)("403s a non-admin on %s %s", async (method, path, body) => {
		const token = await signJwt("alice", false);

		const response = await call(method, path, token, body);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "Admin access required" });
	});

	it.each(
		ADMIN_ROUTES
	)("401s an unauthenticated caller on %s %s", async (method, path, body) => {
		const response = await call(method, path, undefined, body);
		expect(response.status).toBe(401);
	});

	it.each(
		ADMIN_ROUTES
	)("401s a caller with a token signed by someone else on %s %s", async (method, path, body) => {
		const forged = await new SignJWT({
			type: "user-auth",
			username: "alice",
			isAdmin: true,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("a-completely-different-secret-value"));

		const response = await call(method, path, forged, body);

		// isAdmin lives in the token, so an unverified token must never reach
		// requireAdmin at all.
		expect(response.status).toBe(401);
	});

	it("lets an admin through the same chain", async () => {
		const token = await signJwt("ofisk", true);

		const response = await call("GET", "/api/admin/experiments", token);

		expect(response.status).toBe(200);
		expect((await response.json()).experiments).toHaveLength(1);
	});

	it("does not gate the per-user assignments route", async () => {
		const token = await signJwt("alice", false);

		const response = await call("GET", "/api/experiments/assignments", token);

		expect(response.status).toBe(200);
		expect((await response.json()).flags).toEqual({ flagA: true });
	});

	it("still requires a token for the assignments route", async () => {
		const response = await call("GET", "/api/experiments/assignments");
		expect(response.status).toBe(401);
	});
});
