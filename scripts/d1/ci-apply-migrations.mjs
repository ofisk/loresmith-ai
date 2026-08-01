#!/usr/bin/env node
/**
 * Apply D1 migrations as part of an automated deploy, and fail closed.
 *
 * Wraps `wrangler d1 migrations apply` with the two guarantees a deploy needs
 * and the bare command does not give:
 *
 * 1. **Preflight.** Cloudflare's auto-created Workers Builds token carries
 *    Workers Scripts / KV / R2 / Routes but NOT D1. Without an explicit
 *    D1:Edit token the apply cannot work, and wrangler has been observed
 *    exiting 0 on a permission error (workers-sdk#5077). This asserts write
 *    access up front and names the fix.
 *
 * 2. **Post-apply verification.** Every file in migrations/ must have a row in
 *    d1_migrations afterwards. A migration that was skipped for any reason
 *    exits non-zero here, so the caller's `&&` blocks the deploy rather than
 *    shipping code against a schema that never moved.
 *
 * Intended to run BEFORE `wrangler deploy`, so new code never sees an old
 * schema. That ordering is why this belongs in the deploy command rather than
 * in a parallel CI job.
 *
 * Usage:
 *   node scripts/d1/ci-apply-migrations.mjs --config wrangler.jsonc --database loresmith-db --remote
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = join(ROOT, "migrations");

const TOKEN_HELP = [
	"D1 is not reachable with the current credentials.",
	"",
	"Workers Builds creates a token with Workers Scripts, KV, R2 and Routes, but",
	"NOT D1, so migrations cannot run under the default build token.",
	"",
	"Fix: create an API token with BOTH",
	"  - Account > D1 > Edit",
	"  - Account > Workers Scripts > Edit",
	"and add it as the build secret CLOUDFLARE_API_TOKEN in",
	"Cloudflare dashboard > the Worker > Settings > Builds.",
	"",
	"See docs/DATABASE_MIGRATIONS.md.",
].join("\n");

function parseArgs(argv) {
	const out = { config: "wrangler.jsonc", database: "loresmith-db", mode: "" };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--remote" || a === "--local" || a === "--preview") out.mode = a;
		else if (a === "--config" && argv[i + 1]) out.config = argv[++i];
		else if (a === "--database" && argv[i + 1]) out.database = argv[++i];
	}
	return out;
}

function wrangler(args, capture) {
	return spawnSync("npx", ["wrangler", ...args], {
		cwd: ROOT,
		encoding: "utf8",
		// CI=true keeps wrangler non-interactive; it otherwise prompts to confirm.
		env: { ...process.env, CI: "true" },
		stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
	});
}

function baseFlags(flags) {
	return [flags.database, "--config", flags.config, flags.mode];
}

/** Run SQL and return parsed rows, tolerating warnings printed before the JSON. */
function query(flags, sql) {
	const r = wrangler(
		["d1", "execute", ...baseFlags(flags), "--json", `--command=${sql}`],
		true
	);
	const out = (r.stdout || "").trim();
	let parsed = null;
	try {
		parsed = JSON.parse(out);
	} catch {
		const idx = out.indexOf("[");
		if (idx >= 0) {
			try {
				parsed = JSON.parse(out.slice(idx));
			} catch {
				parsed = null;
			}
		}
	}
	const rows =
		Array.isArray(parsed) && Array.isArray(parsed[0]?.results)
			? parsed[0].results
			: [];
	return { ok: r.status === 0, rows, err: r.stderr || r.stdout || "" };
}

/**
 * Prove the token can write to D1. The DDL is idempotent and matches the table
 * wrangler creates itself, so on an existing database it changes nothing while
 * still exercising the write path a migration needs.
 */
function assertD1Access(flags) {
	const r = query(
		flags,
		"CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);"
	);
	if (!r.ok) {
		console.error(TOKEN_HELP);
		console.error(`\nwrangler said:\n${r.err}`);
		process.exit(1);
	}
}

function appliedMigrations(flags) {
	const r = query(flags, "SELECT name FROM d1_migrations;");
	if (!r.ok) {
		console.error("Could not read d1_migrations.\n", r.err);
		process.exit(1);
	}
	return new Set(r.rows.map((row) => String(row.name)));
}

function migrationFiles() {
	if (!existsSync(MIGRATIONS_DIR)) {
		console.error("Migrations directory not found:", MIGRATIONS_DIR);
		process.exit(1);
	}
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

/** Fail closed: anything still unjournaled after apply must block the deploy. */
function verifyAllApplied(flags, files) {
	const applied = appliedMigrations(flags);
	const missing = files.filter((f) => !applied.has(f));
	if (missing.length === 0) {
		console.log(
			`Verified: all ${files.length} migration(s) recorded in d1_migrations.`
		);
		return;
	}
	console.error(
		"\nMigrations are still unapplied after `wrangler d1 migrations apply`:\n"
	);
	for (const m of missing) console.error(`  - ${m}`);
	console.error(
		"\nwrangler can exit 0 while skipping migrations on a permission error",
		"(workers-sdk#5077). Blocking the deploy so code does not ship against an",
		"older schema.\n"
	);
	process.exit(1);
}

function main() {
	const flags = parseArgs(process.argv);
	if (!flags.mode) {
		console.error("Specify one of: --remote, --local, --preview");
		process.exit(1);
	}

	console.log(
		`D1 migrations: database=${flags.database} config=${flags.config} mode=${flags.mode.replace("--", "")}`
	);

	assertD1Access(flags);

	const files = migrationFiles();
	const alreadyApplied = appliedMigrations(flags);
	const pending = files.filter((f) => !alreadyApplied.has(f));
	if (pending.length === 0) {
		console.log(`No pending migrations (${files.length} already applied).`);
		return;
	}
	console.log(`Pending (${pending.length}): ${pending.join(", ")}`);

	const applied = wrangler(
		["d1", "migrations", "apply", ...baseFlags(flags)],
		false
	);
	if (applied.status !== 0) {
		console.error(
			"\n`wrangler d1 migrations apply` failed. The failed migration was rolled",
			"back and earlier ones remain applied. Blocking the deploy.\n"
		);
		process.exit(applied.status ?? 1);
	}

	verifyAllApplied(flags, files);
}

main();
