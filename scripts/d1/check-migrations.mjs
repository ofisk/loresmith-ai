#!/usr/bin/env node
/**
 * PR gate for D1 migrations. Runs with no credentials and no network.
 *
 * Guards the four ways a migration silently does nothing in this repo:
 *
 * 1. Bad filename. Wrangler orders and journals migrations by filename, so
 *    anything outside NNNN_snake_case.sql applies in an unpredictable order.
 * 2. Duplicate sequence number. Two branches both adding 0033_* merge without
 *    a git conflict and then apply in an arbitrary order.
 * 3. Editing an already-merged migration. D1 records applied migrations by
 *    *name*, so a file that ran once never runs again — the edit reaches no
 *    deployed database, forever, with no error.
 * 4. Schema missing from d1-bootstrap.sql. A fresh database is built from
 *    d1-bootstrap.sql and then has d1_migrations seeded from the migration
 *    *filenames*, marking every file applied. A table or column that lives
 *    only in a migration is therefore recorded as applied but never created.
 *
 * Only migrations added on this branch are checked, so existing files are
 * grandfathered.
 *
 * Usage: node scripts/d1/check-migrations.mjs [--base-ref origin/main]
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = join(ROOT, "migrations");
const BOOTSTRAP_SQL = join(__dirname, "d1-bootstrap.sql");

const FILENAME_RE = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/gi;
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s(;]+)/gi;
const ADD_COLUMN_RE =
	/ALTER\s+TABLE\s+([^\s]+)\s+ADD\s+(?:COLUMN\s+)?([^\s(,;]+)/gi;
const CREATE_INDEX_RE =
	/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/gi;

/** Strip SQL identifier quoting so "foo", [foo] and `foo` all compare as foo. */
export function unquoteIdentifier(name) {
	return name.replace(/^["'[`]|["'\]`]$/g, "").trim();
}

/** Remove -- line comments and block comments so they cannot match a rule. */
export function stripSqlComments(sql) {
	return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function collectMatches(sql, regex, groups) {
	const out = [];
	const source = stripSqlComments(sql);
	regex.lastIndex = 0;
	let m = regex.exec(source);
	while (m !== null) {
		out.push(groups.map((g) => unquoteIdentifier(m[g])));
		m = regex.exec(source);
	}
	return out;
}

export function extractCreatedTables(sql) {
	return new Set(collectMatches(sql, CREATE_TABLE_RE, [1]).map((r) => r[0]));
}

export function extractDroppedTables(sql) {
	return new Set(collectMatches(sql, DROP_TABLE_RE, [1]).map((r) => r[0]));
}

export function extractCreatedIndexes(sql) {
	return new Set(collectMatches(sql, CREATE_INDEX_RE, [1]).map((r) => r[0]));
}

export function extractAddedColumns(sql) {
	return collectMatches(sql, ADD_COLUMN_RE, [1, 2]).map(([table, column]) => ({
		table,
		column,
	}));
}

/**
 * Return the parenthesised body of `CREATE TABLE <table> (...)`, or null when
 * the table is absent. Counts parens so nested definitions do not truncate it.
 */
export function findCreateTableBody(sql, table) {
	const source = stripSqlComments(sql);
	const re = new RegExp(
		"CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\"'[\\u0060]?" +
			table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
			"[\"'\\]\\u0060]?\\s*\\(",
		"i"
	);
	const start = source.search(re);
	if (start === -1) return null;
	const open = source.indexOf("(", start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "(") depth++;
		else if (source[i] === ")") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

export function bootstrapHasColumn(bootstrapSql, table, column) {
	const body = findCreateTableBody(bootstrapSql, table);
	if (body === null) return false;
	const re = new RegExp(
		"(^|,)\\s*[\"'[\\u0060]?" +
			column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
			"[\"'\\]\\u0060]?\\s",
		"i"
	);
	return re.test(body);
}

export function checkFilenames(names) {
	return names
		.filter((n) => !FILENAME_RE.test(n))
		.map(
			(n) =>
				`${n}: filename must match NNNN_snake_case.sql (wrangler orders and journals migrations by filename)`
		);
}

export function checkDuplicateSequences(names) {
	const bySeq = new Map();
	for (const name of names) {
		const seq = name.slice(0, 4);
		if (!/^\d{4}$/.test(seq)) continue;
		bySeq.set(seq, [...(bySeq.get(seq) ?? []), name]);
	}
	return [...bySeq.entries()]
		.filter(([, files]) => files.length > 1)
		.map(
			([seq, files]) =>
				`Duplicate migration number ${seq}: ${files.join(", ")}. Two branches added the same number; renumber the newer one.`
		);
}

/**
 * Migrations already on the base branch must be byte-identical. D1 journals by
 * filename, so an edit to an applied file never reaches a deployed database.
 */
export function checkImmutability(baseContents, headContents) {
	const violations = [];
	for (const [name, base] of baseContents) {
		if (!headContents.has(name)) {
			violations.push(
				`${name}: deleted, but it is already recorded in d1_migrations on deployed databases. Add a new migration that reverses it instead.`
			);
			continue;
		}
		if (headContents.get(name) !== base) {
			violations.push(
				`${name}: modified, but it already merged to the base branch. D1 keys applied migrations by filename, so this edit will never run on dev or prod. Add a new migration instead.`
			);
		}
	}
	return violations;
}

function bootstrapTableViolations(name, sql, bootstrapSql) {
	const violations = [];
	for (const table of extractCreatedTables(sql)) {
		if (findCreateTableBody(bootstrapSql, table) === null) {
			violations.push(
				`${name}: creates table "${table}", which is missing from scripts/d1/d1-bootstrap.sql. A fresh database seeds d1_migrations from filenames, so this table would be marked applied but never created.`
			);
		}
	}
	for (const table of extractDroppedTables(sql)) {
		if (findCreateTableBody(bootstrapSql, table) !== null) {
			violations.push(
				`${name}: drops table "${table}", but scripts/d1/d1-bootstrap.sql still creates it. Remove it from bootstrap so a fresh database does not resurrect it.`
			);
		}
	}
	return violations;
}

function bootstrapColumnViolations(name, sql, bootstrapSql) {
	const created = extractCreatedTables(sql);
	return extractAddedColumns(sql)
		.filter(({ table }) => !created.has(table))
		.filter(
			({ table, column }) => !bootstrapHasColumn(bootstrapSql, table, column)
		)
		.map(
			({ table, column }) =>
				`${name}: adds column "${table}.${column}", which is missing from that table in scripts/d1/d1-bootstrap.sql. A fresh database would never get this column.`
		);
}

export function checkBootstrapParity(newMigrations, bootstrapSql) {
	const violations = [];
	for (const [name, sql] of newMigrations) {
		violations.push(...bootstrapTableViolations(name, sql, bootstrapSql));
		violations.push(...bootstrapColumnViolations(name, sql, bootstrapSql));
	}
	return violations;
}

/** Indexes are a performance concern, not a correctness one — warn only. */
export function checkIndexParity(newMigrations, bootstrapSql) {
	const inBootstrap = extractCreatedIndexes(bootstrapSql);
	const warnings = [];
	for (const [name, sql] of newMigrations) {
		for (const index of extractCreatedIndexes(sql)) {
			if (!inBootstrap.has(index)) {
				warnings.push(
					`${name}: creates index "${index}", which is missing from scripts/d1/d1-bootstrap.sql. A fresh database would run without it.`
				);
			}
		}
	}
	return warnings;
}

function git(args) {
	return spawnSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/** Migration filenames and contents at `ref`, or null when the ref is absent. */
function readMigrationsAtRef(ref) {
	const ls = git(["ls-tree", "--name-only", ref, "migrations/"]);
	if (ls.status !== 0) return null;
	const contents = new Map();
	for (const path of ls.stdout.split("\n").filter((p) => p.endsWith(".sql"))) {
		const show = git(["show", `${ref}:${path}`]);
		if (show.status !== 0) return null;
		contents.set(path.replace(/^migrations\//, ""), show.stdout);
	}
	return contents;
}

function parseArgs(argv) {
	const out = { baseRef: process.env.MIGRATION_BASE_REF || "origin/main" };
	for (let i = 2; i < argv.length; i++) {
		if (argv[i] === "--base-ref" && argv[i + 1]) out.baseRef = argv[++i];
	}
	return out;
}

function report(violations, warnings) {
	for (const w of warnings) console.warn(`  warning: ${w}`);
	if (violations.length === 0) {
		console.log("D1 migration check passed.");
		return 0;
	}
	console.error("\nD1 migration check failed:\n");
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"\nSee docs/DATABASE_MIGRATIONS.md for why each of these is silent in production.\n"
	);
	return 1;
}

function main() {
	const { baseRef } = parseArgs(process.argv);
	const names = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	const headContents = new Map(
		names.map((n) => [n, readFileSync(join(MIGRATIONS_DIR, n), "utf8")])
	);
	const bootstrapSql = readFileSync(BOOTSTRAP_SQL, "utf8");

	const violations = [
		...checkFilenames(names),
		...checkDuplicateSequences(names),
	];

	const baseContents = readMigrationsAtRef(baseRef);
	if (baseContents === null) {
		console.warn(
			`  warning: base ref "${baseRef}" not available; skipping the immutability and bootstrap-parity checks. Fetch it to run the full gate.`
		);
		return report(violations, []);
	}

	violations.push(...checkImmutability(baseContents, headContents));

	const newMigrations = [...headContents].filter(
		([name]) => !baseContents.has(name)
	);
	if (newMigrations.length === 0) {
		console.log(`No migrations added against ${baseRef}.`);
		return report(violations, []);
	}
	console.log(
		`Checking ${newMigrations.length} migration(s) added against ${baseRef}: ${newMigrations
			.map(([n]) => n)
			.join(", ")}`
	);
	violations.push(...checkBootstrapParity(newMigrations, bootstrapSql));
	return report(violations, checkIndexParity(newMigrations, bootstrapSql));
}

if (process.argv[1] && process.argv[1].endsWith("check-migrations.mjs")) {
	process.exit(main());
}
