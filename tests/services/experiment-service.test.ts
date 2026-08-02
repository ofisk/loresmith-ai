import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentDAO } from "@/dao/experiment-dao";
import {
	clearExperimentCache,
	EXPERIMENT_CACHE_TTL_MS,
	ExperimentService,
} from "@/services/experiment-service";

/**
 * Counts every SELECT that reaches the database, so the caching claim in the
 * acceptance criteria ("flag reads do not hit D1 on every call") is asserted by
 * query count rather than by inspection.
 */
let selectCount = 0;

function countingD1Adapter(db: DatabaseSync): D1Database {
	return {
		prepare(sql: string) {
			if (sql.trim().toUpperCase().startsWith("SELECT")) selectCount += 1;
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
let d1: D1Database;
let service: ExperimentService;

beforeEach(async () => {
	selectCount = 0;
	db = new DatabaseSync(":memory:");
	db.exec(MIGRATION);
	d1 = countingD1Adapter(db);
	const dao = new ExperimentDAO(d1);
	clearExperimentCache(d1);
	service = new ExperimentService(dao);

	await dao.upsert(
		{ key: "killSwitch", status: "off", description: "off flag" },
		"ofisk"
	);
	await dao.upsert(
		{ key: "shippedFeature", status: "on", description: "on flag" },
		"ofisk"
	);
	await dao.upsert(
		{
			key: "newDashboard",
			status: "experiment",
			rolloutPct: 50,
			description: "split",
		},
		"ofisk"
	);
	selectCount = 0;
});

afterEach(() => {
	vi.useRealTimers();
	clearExperimentCache(d1);
});

describe("flag resolution", () => {
	it("resolves an off flag to control for everyone", async () => {
		expect(await service.getVariant("killSwitch", "alice")).toBe("control");
		expect(await service.isEnabled("killSwitch", "alice")).toBe(false);
	});

	it("resolves an on flag to treatment for everyone", async () => {
		expect(await service.getVariant("shippedFeature", "alice")).toBe(
			"treatment"
		);
		expect(await service.isEnabled("shippedFeature", "bob")).toBe(true);
	});

	it("treats an unknown key as control rather than throwing", async () => {
		// Deleting a row must be equivalent to turning the feature off: the call
		// site keeps compiling and keeps taking the old path.
		expect(await service.getVariant("neverCreated", "alice")).toBe("control");
		expect(await service.isEnabled("neverCreated", "alice")).toBe(false);
	});

	it("returns the whole map for a user", async () => {
		const assignments = await service.getAllForUser("alice");
		expect(Object.keys(assignments).sort()).toEqual([
			"killSwitch",
			"newDashboard",
			"shippedFeature",
		]);
		expect(assignments.killSwitch).toBe("control");
		expect(assignments.shippedFeature).toBe("treatment");
	});

	it("projects the same map to booleans", async () => {
		const flags = await service.getFlagsForUser("alice");
		expect(flags.killSwitch).toBe(false);
		expect(flags.shippedFeature).toBe(true);
		expect(typeof flags.newDashboard).toBe("boolean");
	});

	it("gives a user the same variant across separate service instances", async () => {
		const first = await service.getVariant("newDashboard", "alice");
		clearExperimentCache(d1);
		const second = await new ExperimentService(
			new ExperimentDAO(d1)
		).getVariant("newDashboard", "alice");

		expect(second).toBe(first);
	});

	it("only reports experiment-status rows as running", async () => {
		expect((await service.getRunningExperiments()).map((e) => e.key)).toEqual([
			"newDashboard",
		]);
	});
});

describe("caching", () => {
	it("reads D1 once for many flag checks", async () => {
		await service.isEnabled("killSwitch", "alice");
		await service.isEnabled("shippedFeature", "alice");
		await service.getVariant("newDashboard", "alice");
		await service.getAllForUser("bob");
		await service.getFlagsForUser("carol");

		expect(selectCount).toBe(1);
	});

	it("re-reads D1 after the TTL expires", async () => {
		vi.useFakeTimers();

		await service.isEnabled("killSwitch", "alice");
		expect(selectCount).toBe(1);

		vi.advanceTimersByTime(EXPERIMENT_CACHE_TTL_MS - 1);
		await service.isEnabled("killSwitch", "alice");
		expect(selectCount).toBe(1);

		vi.advanceTimersByTime(2);
		await service.isEnabled("killSwitch", "alice");
		expect(selectCount).toBe(2);
	});

	it("invalidates immediately on write, so an admin sees their own toggle", async () => {
		expect(await service.isEnabled("killSwitch", "alice")).toBe(false);

		await service.upsertExperiment(
			{ key: "killSwitch", status: "on" },
			"ofisk"
		);

		// No TTL wait: the write dropped the snapshot.
		expect(await service.isEnabled("killSwitch", "alice")).toBe(true);
	});

	it("invalidates on delete", async () => {
		expect(await service.isEnabled("shippedFeature", "alice")).toBe(true);

		expect(await service.deleteExperiment("shippedFeature")).toBe(true);

		expect(await service.isEnabled("shippedFeature", "alice")).toBe(false);
	});

	it("serves the stale snapshot when D1 goes away mid-session", async () => {
		await service.getAllForUser("alice");

		const failing = new ExperimentDAO(d1);
		vi.spyOn(failing, "listAll").mockRejectedValue(new Error("D1 down"));
		const degraded = new ExperimentService(failing);

		// A flags table that briefly cannot be read must not take down every
		// request that reads a flag.
		expect(await degraded.isEnabled("shippedFeature", "alice")).toBe(true);
	});

	it("propagates the error when D1 fails with no snapshot to fall back on", async () => {
		clearExperimentCache(d1);
		const failing = new ExperimentDAO(d1);
		vi.spyOn(failing, "listAll").mockRejectedValue(new Error("D1 down"));

		await expect(
			new ExperimentService(failing).getAllForUser("alice")
		).rejects.toThrow("D1 down");
	});
});

describe("admin operations", () => {
	it("lists uncached, so a concurrent write is visible", async () => {
		await service.listExperiments();
		await service.listExperiments();

		expect(selectCount).toBe(2);
	});

	it("clamps a rollout percentage supplied by the admin form", async () => {
		await service.upsertExperiment(
			{ key: "newDashboard", rolloutPct: 999 },
			"ofisk"
		);

		expect((await service.getExperiment("newDashboard"))?.rolloutPct).toBe(100);
	});

	it("ignores an invalid status rather than storing it", async () => {
		await service.upsertExperiment(
			{ key: "newDashboard", status: "bogus" as never },
			"ofisk"
		);

		expect((await service.getExperiment("newDashboard"))?.status).toBe(
			"experiment"
		);
	});

	it("ignores a single-arm variants array", async () => {
		await service.upsertExperiment(
			{ key: "newDashboard", variants: ["only"] },
			"ofisk"
		);

		expect((await service.getExperiment("newDashboard"))?.variants).toEqual([
			"control",
			"treatment",
		]);
	});

	it("reports a delete of a key that was never there", async () => {
		expect(await service.deleteExperiment("neverCreated")).toBe(false);
	});
});
