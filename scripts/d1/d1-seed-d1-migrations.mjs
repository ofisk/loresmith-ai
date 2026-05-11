#!/usr/bin/env node

/**
 * Baseline `d1_migrations` after `d1-bootstrap.sql` so `wrangler d1 migrations apply`
 * only runs migration files added *after* this snapshot (Cloudflare D1 workflow).
 *
 * Safe when the journal is empty (typical right after bootstrap on a new database).
 * If `d1_migrations` already has rows, exits without writing (avoids falsely marking
 * migrations as applied on partially migrated databases).
 *
 * Usage:
 *   node scripts/d1/d1-seed-d1-migrations.mjs local
 *   node scripts/d1/d1-seed-d1-migrations.mjs dev
 *   node scripts/d1/d1-seed-d1-migrations.mjs prod
 *   node scripts/d1/d1-seed-d1-migrations.mjs e2e   # uses E2E_WRANGLER_CONFIG or wrangler.e2e.jsonc
 */

import { spawnSync } from "node:child_process";
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DEFAULT_MIGRATIONS_DIR = join(ROOT, "migrations");

function wranglerJson(args) {
	const r = spawnSync("npx", ["wrangler", ...args], {
		cwd: ROOT,
		encoding: "utf8",
		shell: false,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let parsed = null;
	const out = (r.stdout || "").trim();
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
	return {
		status: r.status ?? 1,
		parsed,
		stderr: r.stderr || "",
		stdout: r.stdout || "",
	};
}

function firstResultRows(parsed) {
	if (!Array.isArray(parsed) || parsed.length === 0) return [];
	const block = parsed[0];
	if (!block || !Array.isArray(block.results)) return [];
	return block.results;
}

function remoteFlags(config, remoteFlag) {
	const f = ["--config", config];
	if (remoteFlag === "--remote") f.push("--remote");
	if (remoteFlag === "--local") f.push("--local");
	return f;
}

function executeCommand(database, config, remoteFlag, sql) {
	const args = [
		"d1",
		"execute",
		database,
		...remoteFlags(config, remoteFlag),
		"--json",
		`--command=${sql}`,
	];
	return wranglerJson(args);
}

function executeFile(database, config, remoteFlag, filePath) {
	const args = [
		"d1",
		"execute",
		database,
		...remoteFlags(config, remoteFlag),
		"--json",
		`--file=${filePath}`,
	];
	return wranglerJson(args);
}

function escapeSqlString(s) {
	return s.replace(/'/g, "''");
}

function main() {
	const env = (process.argv[2] || "local").toLowerCase();
	let dbName;
	let config;
	let remoteFlag;
	if (env === "local") {
		dbName = "loresmith-db-dev";
		config = "wrangler.local.jsonc";
		remoteFlag = "--local";
	} else if (env === "dev") {
		dbName = "loresmith-db-dev";
		config = "wrangler.dev.jsonc";
		remoteFlag = "--remote";
	} else if (env === "prod") {
		dbName = "loresmith-db";
		config = "wrangler.jsonc";
		remoteFlag = "--remote";
	} else if (env === "e2e") {
		dbName = "loresmith-db-dev";
		config = process.env.E2E_WRANGLER_CONFIG || "wrangler.e2e.jsonc";
		remoteFlag = "--local";
	} else {
		console.error(
			"Usage: node scripts/d1/d1-seed-d1-migrations.mjs [local|dev|prod|e2e]"
		);
		process.exit(1);
	}

	const ensure = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
	const r0 = executeCommand(dbName, config, remoteFlag, ensure);
	if (r0.status !== 0) {
		console.error("Failed to ensure d1_migrations:", r0.stderr || r0.stdout);
		process.exit(1);
	}

	const rCount = executeCommand(
		dbName,
		config,
		remoteFlag,
		"SELECT COUNT(*) as c FROM d1_migrations;"
	);
	const rows = firstResultRows(rCount.parsed);
	const count = rows[0]?.c ?? rows[0]?.C ?? 0;
	const applied = Number(count) || 0;
	if (applied > 0) {
		console.log(
			`d1_migrations already has ${applied} row(s); skipping baseline seed (use a fresh DB or reset local state if you need a clean journal).`
		);
		process.exit(0);
	}

	const files = readdirSync(DEFAULT_MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

	if (files.length === 0) {
		console.error("No .sql files in migrations/");
		process.exit(1);
	}

	const values = files
		.map((name) => `('${escapeSqlString(name)}', datetime('now'))`)
		.join(",\n");

	const body = `INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES
${values};
`;

	const tmp = join(__dirname, ".generated-d1-seed-migrations.sql");
	writeFileSync(tmp, body, "utf8");
	const r1 = executeFile(dbName, config, remoteFlag, tmp);
	unlinkSync(tmp, { force: true });

	if (r1.status !== 0) {
		console.error("Failed to seed d1_migrations:", r1.stderr || r1.stdout);
		process.exit(1);
	}

	console.log(
		`Seeded d1_migrations with ${files.length} migration name(s). Future runs of wrangler d1 migrations apply will only execute new files.`
	);
}

main();
