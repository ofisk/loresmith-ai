import { describe, expect, it } from "vitest";
// Relative import: scripts/ lives outside src/, so the @/ alias does not reach it.
import {
	bootstrapHasColumn,
	checkBootstrapParity,
	checkDuplicateSequences,
	checkFilenames,
	checkImmutability,
	checkIndexParity,
	extractAddedColumns,
	extractCreatedTables,
	extractDroppedTables,
	findCreateTableBody,
	stripSqlComments,
	unquoteIdentifier,
} from "../../scripts/d1/check-migrations.mjs";

describe("unquoteIdentifier", () => {
	it.each([
		['"users"', "users"],
		["[users]", "users"],
		["`users`", "users"],
		["users", "users"],
	])("unwraps %s", (input, expected) => {
		expect(unquoteIdentifier(input)).toBe(expected);
	});
});

describe("stripSqlComments", () => {
	it("ignores DDL that only appears inside a comment", () => {
		const sql = [
			"-- CREATE TABLE ghost_table (id TEXT);",
			"/* CREATE TABLE other_ghost (id TEXT); */",
			"CREATE TABLE real_table (id TEXT);",
		].join("\n");
		expect([...extractCreatedTables(sql)]).toEqual(["real_table"]);
		expect(stripSqlComments(sql)).not.toContain("ghost_table");
	});
});

describe("extractCreatedTables", () => {
	it("handles IF NOT EXISTS and quoted names", () => {
		const sql =
			'CREATE TABLE IF NOT EXISTS "a" (id TEXT); CREATE TABLE b (id TEXT);';
		expect([...extractCreatedTables(sql)].sort()).toEqual(["a", "b"]);
	});
});

describe("extractDroppedTables", () => {
	it("handles IF EXISTS", () => {
		expect([...extractDroppedTables("DROP TABLE IF EXISTS old_one;")]).toEqual([
			"old_one",
		]);
	});
});

describe("extractAddedColumns", () => {
	it("reads table and column, with or without the COLUMN keyword", () => {
		const sql = [
			"ALTER TABLE files ADD COLUMN content_type TEXT NOT NULL DEFAULT '';",
			"ALTER TABLE files ADD size INTEGER;",
		].join("\n");
		expect(extractAddedColumns(sql)).toEqual([
			{ table: "files", column: "content_type" },
			{ table: "files", column: "size" },
		]);
	});
});

describe("findCreateTableBody", () => {
	const sql = [
		"CREATE TABLE IF NOT EXISTS jobs (",
		"  id TEXT PRIMARY KEY,",
		"  status TEXT NOT NULL CHECK (status IN ('a', 'b')),",
		"  FOREIGN KEY (id) REFERENCES other(id)",
		");",
		"CREATE TABLE later (x TEXT);",
	].join("\n");

	it("returns the full body past nested parentheses", () => {
		const body = findCreateTableBody(sql, "jobs");
		expect(body).toContain("status");
		expect(body).toContain("FOREIGN KEY");
		// Must stop at its own closing paren, not swallow the next table.
		expect(body).not.toContain("later");
	});

	it("returns null for an absent table", () => {
		expect(findCreateTableBody(sql, "missing")).toBeNull();
	});
});

describe("bootstrapHasColumn", () => {
	const bootstrap = "CREATE TABLE files (\n  id TEXT,\n  content_type TEXT\n);";

	it("finds a declared column", () => {
		expect(bootstrapHasColumn(bootstrap, "files", "content_type")).toBe(true);
	});

	it("does not match a column that is only a prefix of another", () => {
		expect(bootstrapHasColumn(bootstrap, "files", "content")).toBe(false);
	});

	it("is false when the table is absent", () => {
		expect(bootstrapHasColumn(bootstrap, "ghosts", "id")).toBe(false);
	});
});

describe("checkFilenames", () => {
	it("accepts NNNN_snake_case.sql", () => {
		expect(checkFilenames(["0033_add_widgets.sql"])).toEqual([]);
	});

	it.each([
		"33_add_widgets.sql",
		"0033-add-widgets.sql",
		"0033_AddWidgets.sql",
	])("rejects %s", (name) => {
		expect(checkFilenames([name])).toHaveLength(1);
	});
});

describe("checkDuplicateSequences", () => {
	it("flags two branches that both used the same number", () => {
		const violations = checkDuplicateSequences([
			"0033_alpha.sql",
			"0033_beta.sql",
			"0034_gamma.sql",
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("0033");
	});

	it("passes on distinct numbers", () => {
		expect(checkDuplicateSequences(["0033_a.sql", "0034_b.sql"])).toEqual([]);
	});
});

describe("checkImmutability", () => {
	const base = new Map([["0001_init.sql", "CREATE TABLE a (id TEXT);"]]);

	it("passes when merged migrations are untouched", () => {
		expect(checkImmutability(base, new Map(base))).toEqual([]);
	});

	it("flags an edit to an already-merged migration", () => {
		const head = new Map([["0001_init.sql", "CREATE TABLE a (id INTEGER);"]]);
		const violations = checkImmutability(base, head);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("never run");
	});

	it("flags a deleted migration", () => {
		const violations = checkImmutability(base, new Map());
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("deleted");
	});

	it("ignores migrations added on the branch", () => {
		const head = new Map([
			...base,
			["0002_new.sql", "CREATE TABLE b (id TEXT);"],
		]);
		expect(checkImmutability(base, head)).toEqual([]);
	});
});

describe("checkBootstrapParity", () => {
	const bootstrap = "CREATE TABLE files (\n  id TEXT,\n  name TEXT\n);";

	it("flags a table that exists only in the migration", () => {
		const violations = checkBootstrapParity(
			[["0033_widgets.sql", "CREATE TABLE widgets (id TEXT);"]],
			bootstrap
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("widgets");
		expect(violations[0]).toContain("d1-bootstrap.sql");
	});

	it("passes when bootstrap already declares the table", () => {
		expect(
			checkBootstrapParity(
				[["0033_files.sql", "CREATE TABLE IF NOT EXISTS files (id TEXT);"]],
				bootstrap
			)
		).toEqual([]);
	});

	it("flags a column added only by the migration", () => {
		const violations = checkBootstrapParity(
			[["0033_size.sql", "ALTER TABLE files ADD COLUMN size INTEGER;"]],
			bootstrap
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("files.size");
	});

	it("does not flag columns on a table the same migration creates", () => {
		const sql = [
			"CREATE TABLE widgets (id TEXT);",
			"ALTER TABLE widgets ADD COLUMN label TEXT;",
		].join("\n");
		const violations = checkBootstrapParity([["0033_w.sql", sql]], bootstrap);
		// Only the missing table, not a second complaint about its column.
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("creates table");
	});

	it("flags a dropped table that bootstrap still creates", () => {
		const violations = checkBootstrapParity(
			[["0033_drop.sql", "DROP TABLE files;"]],
			bootstrap
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("still creates it");
	});
});

describe("checkIndexParity", () => {
	it("warns about an index missing from bootstrap", () => {
		const warnings = checkIndexParity(
			[["0033_idx.sql", "CREATE INDEX idx_files_name ON files(name);"]],
			"CREATE TABLE files (id TEXT, name TEXT);"
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("idx_files_name");
	});

	it("is quiet when bootstrap declares the index", () => {
		expect(
			checkIndexParity(
				[["0033_idx.sql", "CREATE INDEX idx_files_name ON files(name);"]],
				"CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);"
			)
		).toEqual([]);
	});
});
