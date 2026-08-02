import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { ExperimentDAO } from "@/dao/experiment-dao";

/**
 * Run against real SQL rather than a mocked D1, because the two things most
 * likely to break here are both SQL-level: the partial-update `ON CONFLICT`
 * upsert (a PATCH that only moves the slider must not blank the description),
 * and the JSON round-trip of `variants`, which SQLite stores as plain text.
 *
 * The schema comes from the migration file, so these tests fail if the migration
 * and the queries drift apart.
 */
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

let db: DatabaseSync;
let dao: ExperimentDAO;

beforeEach(() => {
	db = new DatabaseSync(":memory:");
	db.exec(MIGRATION);
	dao = new ExperimentDAO(d1Adapter(db));
});

describe("ExperimentDAO", () => {
	it("creates a flag with safe defaults", async () => {
		await dao.upsert({ key: "newDashboard" }, "ofisk");

		const experiment = await dao.getByKey("newDashboard");
		expect(experiment).toMatchObject({
			key: "newDashboard",
			description: "",
			// A brand-new flag must be inert: creating one can never change behavior.
			status: "off",
			rolloutPct: 0,
			variants: ["control", "treatment"],
			updatedBy: "ofisk",
		});
	});

	it("round-trips every field on create", async () => {
		await dao.upsert(
			{
				key: "betaSearch",
				description: "New search ranking",
				status: "experiment",
				rolloutPct: 25,
				variants: ["old-ranking", "new-ranking"],
			},
			"ofisk"
		);

		expect(await dao.getByKey("betaSearch")).toMatchObject({
			description: "New search ranking",
			status: "experiment",
			rolloutPct: 25,
			variants: ["old-ranking", "new-ranking"],
		});
	});

	it("leaves omitted fields untouched on update", async () => {
		await dao.upsert(
			{ key: "betaSearch", description: "New search ranking", status: "off" },
			"ofisk"
		);

		// The admin UI's rollout slider sends only rolloutPct.
		await dao.upsert({ key: "betaSearch", rolloutPct: 40 }, "aniham");

		expect(await dao.getByKey("betaSearch")).toMatchObject({
			description: "New search ranking",
			status: "off",
			rolloutPct: 40,
			updatedBy: "aniham",
		});
	});

	it("records who last changed a flag", async () => {
		await dao.upsert({ key: "flagA" }, "ofisk");
		await dao.upsert({ key: "flagA", status: "on" }, "aniham");

		expect((await dao.getByKey("flagA"))?.updatedBy).toBe("aniham");
	});

	it("clamps an out-of-range rollout percentage rather than storing it", async () => {
		await dao.upsert({ key: "flagA", rolloutPct: 5000 }, "ofisk");
		expect((await dao.getByKey("flagA"))?.rolloutPct).toBe(100);

		await dao.upsert({ key: "flagA", rolloutPct: -20 }, "ofisk");
		expect((await dao.getByKey("flagA"))?.rolloutPct).toBe(0);
	});

	it("lists every flag in key order", async () => {
		await dao.upsert({ key: "zeta" }, "ofisk");
		await dao.upsert({ key: "alpha" }, "ofisk");
		await dao.upsert({ key: "mid" }, "ofisk");

		expect((await dao.listAll()).map((e) => e.key)).toEqual([
			"alpha",
			"mid",
			"zeta",
		]);
	});

	it("returns null for an unknown key", async () => {
		expect(await dao.getByKey("nope")).toBeNull();
	});

	it("reports how many rows a delete removed", async () => {
		await dao.upsert({ key: "flagA" }, "ofisk");

		expect(await dao.deleteByKey("flagA")).toBe(1);
		expect(await dao.deleteByKey("flagA")).toBe(0);
		expect(await dao.getByKey("flagA")).toBeNull();
	});

	it("degrades a corrupt row instead of throwing on the read path", async () => {
		// Written straight to SQL: a row that predates validation, or one an
		// operator hand-edited. Flag reads happen on every authenticated request,
		// so one bad row must not take the app down.
		db.exec(
			`INSERT INTO experiments (key, description, status, rollout_pct, variants)
       VALUES ('broken', 'legacy', 'bogus-status', 700, 'not json')`
		);

		expect(await dao.getByKey("broken")).toMatchObject({
			status: "off",
			rolloutPct: 100,
			variants: ["control", "treatment"],
		});
	});
});
