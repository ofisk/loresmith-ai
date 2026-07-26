import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { FileDAO } from "@/dao/file/file-dao";

/**
 * Regression guard for the stuck-file cleanup timeout.
 *
 * `file_metadata.updated_at` is TEXT and every writer sets it via
 * CURRENT_TIMESTAMP / datetime('now') => "YYYY-MM-DD HH:MM:SS". The cleanup
 * query previously compared it against a JS `toISOString()` cutoff
 * ("YYYY-MM-DDTHH:MM:SS.mmmZ"). SQLite compares those as strings: they match
 * for 10 characters, then ' ' (0x20) sorts below 'T' (0x54), so every same-day
 * row looked older than the cutoff no matter how recently it was touched.
 * Result: the 5-minute cron marked in-flight uploads ERROR minutes into what
 * was supposed to be a 10-minute grace period.
 *
 * These run against real SQLite -- a mocked D1 cannot exercise comparison
 * semantics, which is the entire defect.
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
							db.prepare(sql).run(...(params as []));
							return {};
						},
					};
				},
			};
		},
	} as unknown as D1Database;
}

describe("FileDAO.getStuckProcessingFiles", () => {
	let db: DatabaseSync;
	let fileDAO: FileDAO;

	beforeEach(() => {
		db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE file_metadata (
				file_key text primary key,
				username text not null,
				file_name text not null,
				tags text,
				status text,
				updated_at datetime
			);
		`);
		fileDAO = new FileDAO(d1Adapter(db));
	});

	const insert = (key: string, status: string, updatedAtSql: string) => {
		db.exec(
			`INSERT INTO file_metadata (file_key, username, file_name, tags, status, updated_at)
			 VALUES ('${key}', 'ofisk', '${key}.pdf', '[]', '${status}', ${updatedAtSql})`
		);
	};

	it("does not flag a file that is still well inside the timeout", async () => {
		insert("fresh", "syncing", "CURRENT_TIMESTAMP");

		const stuck = await fileDAO.getStuckProcessingFiles(10);

		expect(stuck).toHaveLength(0);
	});

	it("flags a file that has genuinely exceeded the timeout", async () => {
		insert("old", "syncing", "datetime('now', '-30 minutes')");

		const stuck = await fileDAO.getStuckProcessingFiles(10);

		expect(stuck.map((f) => f.file_key)).toEqual(["old"]);
	});

	it("separates fresh from expired files in the same sweep", async () => {
		insert("fresh", "syncing", "CURRENT_TIMESTAMP");
		insert("recent", "uploaded", "datetime('now', '-2 minutes')");
		insert("expired", "processing", "datetime('now', '-11 minutes')");
		insert("ancient", "indexing", "datetime('now', '-3 hours')");

		const stuck = await fileDAO.getStuckProcessingFiles(10);

		expect(stuck.map((f) => f.file_key).sort()).toEqual(["ancient", "expired"]);
	});

	it("ignores files that are not in an in-flight status", async () => {
		insert("done", "completed", "datetime('now', '-3 hours')");
		insert("failed", "error", "datetime('now', '-3 hours')");

		const stuck = await fileDAO.getStuckProcessingFiles(10);

		expect(stuck).toHaveLength(0);
	});

	it("ignores rows with a null updated_at rather than treating them as stuck", async () => {
		insert("nulled", "syncing", "NULL");

		const stuck = await fileDAO.getStuckProcessingFiles(10);

		expect(stuck).toHaveLength(0);
	});

	it("documents the format mismatch that caused the original bug", () => {
		// Both sides describe the same instant, but the serializations disagree.
		const stored = "2026-07-26 01:22:23"; // CURRENT_TIMESTAMP
		const cutoff = new Date("2026-07-26T01:12:23.000Z").toISOString();

		const row = db
			.prepare("SELECT (? < ?) AS looks_older")
			.get(stored, cutoff) as { looks_older: number };

		// A row updated 10 minutes AFTER the cutoff still compares as older.
		expect(row.looks_older).toBe(1);
	});
});
