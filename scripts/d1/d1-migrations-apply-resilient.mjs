#!/usr/bin/env node
/**
 * Apply D1 migrations one file at a time, recording successes in `d1_migrations`.
 * On failure: logs the error and continues to the next file (no journal row).
 *
 * **When to use**
 * - Recovery after a restore or a broken migration state, when you explicitly want
 *   "best effort" forward progress.
 *
 * **Prefer first** (safer: Cloudflare rolls back a failed migration and keeps prior state):
 *   npx wrangler d1 migrations apply loresmith-db --config wrangler.jsonc --remote -y
 *
 * **Risks of this script**
 * - A migration that partially applies then errors can leave the DB inconsistent; the
 *   file will run again on the next invocation because no `d1_migrations` row is written.
 * - Inspect failures and fix SQL or repair the DB before re-running.
 *
 * Usage:
 *   node scripts/d1/d1-migrations-apply-resilient.mjs --config wrangler.jsonc --database loresmith-db --remote
 *   node scripts/d1/d1-migrations-apply-resilient.mjs --config wrangler.local.jsonc --database loresmith-db-dev --local
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DEFAULT_MIGRATIONS_DIR = join(ROOT, "migrations");

function parseArgs(argv) {
	const out = {
		config: "wrangler.jsonc",
		database: "loresmith-db",
		remote: false,
		local: false,
		preview: false,
		migrationsDir: DEFAULT_MIGRATIONS_DIR,
		dryRun: false,
	};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--remote") out.remote = true;
		else if (a === "--local") out.local = true;
		else if (a === "--preview") out.preview = true;
		else if (a === "--dry-run") out.dryRun = true;
		else if (a === "--config" && argv[i + 1]) out.config = argv[++i];
		else if (a === "--database" && argv[i + 1]) out.database = argv[++i];
		else if (a === "--migrations-dir" && argv[i + 1])
			out.migrationsDir = resolve(ROOT, argv[++i]);
		else if (a === "-h" || a === "--help") {
			console.log(`Usage: node scripts/d1/d1-migrations-apply-resilient.mjs \\
  [--config wrangler.jsonc] [--database loresmith-db] [--remote|--local|--preview] \\
  [--migrations-dir migrations] [--dry-run]`);
			process.exit(0);
		}
	}
	const n = [out.remote, out.local, out.preview].filter(Boolean).length;
	if (n > 1) {
		console.error("Use only one of: --remote, --local, --preview");
		process.exit(1);
	}
	return out;
}

function wranglerBase(args, opts) {
	const r = spawnSync("npx", ["wrangler", ...args], {
		cwd: ROOT,
		encoding: "utf8",
		shell: false,
		env: process.env,
		...opts,
	});
	return r;
}

function wranglerJson(args) {
	const r = wranglerBase(args, { stdio: ["ignore", "pipe", "pipe"] });
	let parsed = null;
	const out = (r.stdout || "").trim();
	try {
		parsed = JSON.parse(out);
	} catch {
		// Wrangler sometimes prints warnings before JSON
		const idx = out.indexOf("[");
		if (idx >= 0) {
			try {
				parsed = JSON.parse(out.slice(idx));
			} catch {
				parsed = null;
			}
		}
	}
	return {
		status: r.status ?? 1,
		parsed,
		stderr: r.stderr || "",
		stdout: r.stdout || "",
	};
}

function remoteFlags(flags) {
	const f = ["--config", flags.config];
	if (flags.remote) f.push("--remote");
	if (flags.local) f.push("--local");
	if (flags.preview) f.push("--preview");
	return f;
}

function executeCommand(flags, sql) {
	const args = [
		"d1",
		"execute",
		flags.database,
		...remoteFlags(flags),
		"--json",
		`--command=${sql}`,
	];
	return wranglerJson(args);
}

function executeFile(flags, filePath) {
	const args = [
		"d1",
		"execute",
		flags.database,
		...remoteFlags(flags),
		"--json",
		`--file=${filePath}`,
	];
	return wranglerJson(args);
}

function firstResultRows(parsed) {
	if (!Array.isArray(parsed) || parsed.length === 0) return [];
	const block = parsed[0];
	if (!block || !Array.isArray(block.results)) return [];
	return block.results;
}

function ensureMigrationsTable(flags) {
	const sql = `CREATE TABLE IF NOT EXISTS d1_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;
	const r = executeCommand(flags, sql);
	if (r.status !== 0) {
		console.error(
			"Failed to ensure d1_migrations table:",
			r.stderr || r.stdout
		);
		process.exit(1);
	}
	const idx = executeCommand(
		flags,
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_migrations_name ON d1_migrations(name);"
	);
	if (idx.status !== 0) {
		console.error(
			"Failed to create d1_migrations name index:",
			idx.stderr || idx.stdout
		);
		process.exit(1);
	}
}

function isApplied(flags, name) {
	const safe = name.replace(/'/g, "''");
	const r = executeCommand(
		flags,
		`SELECT 1 as ok FROM d1_migrations WHERE name = '${safe}' LIMIT 1;`
	);
	const rows = firstResultRows(r.parsed);
	return r.status === 0 && rows.length > 0 && rows[0].ok === 1;
}

function nextMigrationId(flags) {
	const r = executeCommand(flags, "SELECT id FROM d1_migrations;");
	const rows = firstResultRows(r.parsed);
	let max = 0;
	for (const row of rows) {
		const n = Number.parseInt(String(row.id), 10);
		if (Number.isFinite(n) && n > max) max = n;
	}
	return String(max + 1).padStart(5, "0");
}

function recordApplied(flags, id, name) {
	const safeName = name.replace(/'/g, "''");
	const sql = `INSERT OR IGNORE INTO d1_migrations (id, name, applied_at) VALUES ('${id}', '${safeName}', datetime('now'));`;
	const r = executeCommand(flags, sql);
	if (r.status !== 0) {
		console.error(
			`WARNING: migration SQL ran but failed to record in d1_migrations: ${name}`,
			r.stderr || r.stdout
		);
		return false;
	}
	if (isApplied(flags, name)) {
		return true;
	}
	console.error(
		`WARNING: INSERT did not persist row for ${name}; check d1_migrations manually.`
	);
	return false;
}

function main() {
	const flags = parseArgs(process.argv);

	if (!existsSync(flags.migrationsDir)) {
		console.error("Migrations directory not found:", flags.migrationsDir);
		process.exit(1);
	}

	const net = flags.remote || flags.local || flags.preview;
	if (!net) {
		console.error(
			"Specify one of: --remote (production), --local, or --preview"
		);
		process.exit(1);
	}

	const files = readdirSync(flags.migrationsDir)
		.filter((f) => f.endsWith(".sql"))
		.sort();

	if (files.length === 0) {
		console.log("No .sql files in", flags.migrationsDir);
		process.exit(0);
	}

	console.log("Database:", flags.database);
	console.log("Config:", flags.config);
	console.log(
		"Mode:",
		flags.remote ? "remote" : flags.preview ? "preview" : "local"
	);
	console.log("Migrations:", flags.migrationsDir);
	console.log("Files:", files.length);
	if (flags.dryRun) {
		console.log("--dry-run: would process:", files.join(", "));
		process.exit(0);
	}

	ensureMigrationsTable(flags);

	let appliedNow = 0;
	let skipped = 0;
	let failed = 0;

	for (const file of files) {
		if (isApplied(flags, file)) {
			skipped++;
			continue;
		}

		const fullPath = join(flags.migrationsDir, file);
		console.log("\n→ Applying", file, "…");
		const run = executeFile(flags, fullPath);
		if (run.status !== 0) {
			failed++;
			console.error("FAILED:", file);
			console.error(run.stderr || run.stdout);
			console.error("(continuing to next file)\n");
			continue;
		}

		const id = nextMigrationId(flags);
		if (!recordApplied(flags, id, file)) {
			failed++;
			continue;
		}
		appliedNow++;
		console.log("Recorded as", id, "—", file);
	}

	console.log("\n--- Summary ---");
	console.log("Already applied (skipped):", skipped);
	console.log("Applied this run:", appliedNow);
	console.log("Failed (not recorded, will retry next run):", failed);
	if (failed > 0) {
		process.exitCode = 1;
	}
}

main();
