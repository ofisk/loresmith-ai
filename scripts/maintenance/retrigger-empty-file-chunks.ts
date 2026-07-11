#!/usr/bin/env npx tsx
/**
 * Production repair: re-trigger RAG indexing for library files with empty file_chunks.
 *
 * Endpoint: POST /api/rag/trigger-indexing  body: { "fileKey": "..." }
 * Auth: Authorization: Bearer <JWT> — JWT username must own each file (no admin bypass).
 *
 * Usage (from repo root):
 *
 *   # List candidates only (queries remote D1; no POSTs)
 *   export LORESMITH_JWT="eyJ..."   # Application → Local Storage → loresmith-jwt on loresmith.ai
 *   npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts --dry-run
 *
 *   # Trigger indexing for each candidate (completed/processed + 0 chunks)
 *   npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts
 *
 *   # All library files for this JWT user (not only zero-chunk completed)
 *   npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts --all
 *
 *   # Explicit keys (skips D1 query; API still enforces ownership)
 *   npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts --keys key1,key2
 *   npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts --keys-file ./keys.txt
 *
 * Env:
 *   LORESMITH_JWT       required (except --help)
 *   LORESMITH_API_BASE  default https://loresmith.ai
 *   LORESMITH_USERNAME  optional; defaults to username claim in JWT
 *   D1_DATABASE         default loresmith-db
 *   WRANGLER_CONFIG     default wrangler.jsonc
 *   DELAY_MS            default 2000 (sleep between POSTs)
 *   LOCAL_D1=1          use wrangler --local instead of --remote
 *
 * Multi-user: one JWT = one user. Re-run with each owner's JWT to repair other users.
 *
 * Caveats: embedding cost per file; large files may return MEMORY_LIMIT_EXCEEDED;
 * in-progress files get 409 INDEXING_IN_PROGRESS.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

type FileRow = {
	file_key: string;
	file_name?: string;
	username?: string;
	status?: string;
	file_size?: number | null;
};

type CliOptions = {
	help: boolean;
	dryRun: boolean;
	all: boolean;
	keys: string[];
	keysFile: string | null;
	delayMs: number;
};

function printHelp(): void {
	console.log(`Usage: npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts [options]

Options:
  --help           Show this help
  --dry-run        List fileKeys only; do not POST
  --all            All library files for the JWT user (default: completed/processed with 0 chunks)
  --keys a,b,c     Explicit file keys (comma-separated); skips D1
  --keys-file PATH One file_key per line; skips D1
  --delay-ms N     Milliseconds between POSTs (default: DELAY_MS env or 2000)

Env: LORESMITH_JWT (required), LORESMITH_API_BASE, LORESMITH_USERNAME,
     D1_DATABASE, WRANGLER_CONFIG, DELAY_MS, LOCAL_D1=1

See script header for production examples and caveats.`);
}

function parseArgs(argv: string[]): CliOptions {
	const opts: CliOptions = {
		help: false,
		dryRun: false,
		all: false,
		keys: [],
		keysFile: null,
		delayMs: Number(process.env.DELAY_MS || 2000),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			opts.help = true;
		} else if (arg === "--dry-run") {
			opts.dryRun = true;
		} else if (arg === "--all") {
			opts.all = true;
		} else if (arg === "--keys") {
			const value = argv[++i];
			if (!value) throw new Error("--keys requires a comma-separated list");
			opts.keys = value
				.split(",")
				.map((k) => k.trim())
				.filter(Boolean);
		} else if (arg.startsWith("--keys=")) {
			opts.keys = arg
				.slice("--keys=".length)
				.split(",")
				.map((k) => k.trim())
				.filter(Boolean);
		} else if (arg === "--keys-file") {
			const value = argv[++i];
			if (!value) throw new Error("--keys-file requires a path");
			opts.keysFile = value;
		} else if (arg.startsWith("--keys-file=")) {
			opts.keysFile = arg.slice("--keys-file=".length);
		} else if (arg === "--delay-ms") {
			const value = argv[++i];
			if (!value) throw new Error("--delay-ms requires a number");
			opts.delayMs = Number(value);
		} else if (arg.startsWith("--delay-ms=")) {
			opts.delayMs = Number(arg.slice("--delay-ms=".length));
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!Number.isFinite(opts.delayMs) || opts.delayMs < 0) {
		throw new Error(`Invalid delay-ms: ${opts.delayMs}`);
	}

	return opts;
}

function parseJwtUsername(jwt: string): string | null {
	try {
		const part = jwt.split(".")[1] || "";
		let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
		while (base64.length % 4) base64 += "=";
		const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
		return typeof payload.username === "string" ? payload.username : null;
	} catch {
		return null;
	}
}

function sqlEscape(value: string): string {
	return value.replace(/'/g, "''");
}

function buildCandidateQuery(username: string, all: boolean): string {
	const u = sqlEscape(username);
	if (all) {
		return `
SELECT file_key, file_name, username, status, file_size
FROM file_metadata
WHERE username = '${u}'
ORDER BY file_key;
`.trim();
	}
	return `
SELECT fm.file_key, fm.file_name, fm.username, fm.status, fm.file_size
FROM file_metadata fm
WHERE fm.username = '${u}'
  AND fm.status IN ('completed', 'processed')
  AND NOT EXISTS (
    SELECT 1 FROM file_chunks fc WHERE fc.file_key = fm.file_key
  )
ORDER BY fm.file_key;
`.trim();
}

function extractD1Results(raw: string): FileRow[] {
	const start = raw.indexOf("[");
	if (start < 0) {
		throw new Error(`Unexpected wrangler output (no JSON array):\n${raw}`);
	}
	const parsed = JSON.parse(raw.slice(start)) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error(`Unexpected wrangler JSON shape: ${typeof parsed}`);
	}

	const rows: FileRow[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== "object") continue;
		const results = (entry as { results?: unknown }).results;
		if (!Array.isArray(results)) continue;
		for (const row of results) {
			if (!row || typeof row !== "object") continue;
			const fileKey = (row as FileRow).file_key;
			if (typeof fileKey === "string" && fileKey.length > 0) {
				rows.push(row as FileRow);
			}
		}
	}
	return rows;
}

function queryD1(username: string, all: boolean): FileRow[] {
	const dbName = process.env.D1_DATABASE || "loresmith-db";
	const config = process.env.WRANGLER_CONFIG || "wrangler.jsonc";
	const local = process.env.LOCAL_D1 === "1";
	const sql = buildCandidateQuery(username, all);

	const args = [
		"wrangler",
		"d1",
		"execute",
		dbName,
		"--config",
		config,
		local ? "--local" : "--remote",
		"-y",
		"--json",
		"--command",
		sql,
	];

	console.error(
		`=== D1 ${local ? "local" : "remote"} query on ${dbName} (user=${username}, mode=${all ? "all" : "empty-chunks"})`
	);

	let stdout: string;
	try {
		stdout = execFileSync("npx", args, {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
	} catch (err) {
		const e = err as { stderr?: string; stdout?: string; message?: string };
		const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join("\n");
		throw new Error(`wrangler d1 execute failed:\n${detail}`);
	}

	return extractD1Results(stdout);
}

function loadKeysFromFile(filePath: string): string[] {
	const resolved = path.isAbsolute(filePath)
		? filePath
		: path.resolve(process.cwd(), filePath);
	const text = fs.readFileSync(resolved, "utf8");
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerIndexing(
	apiBase: string,
	jwt: string,
	fileKey: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
	const url = `${apiBase.replace(/\/$/, "")}/api/rag/trigger-indexing`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${jwt}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ fileKey }),
	});

	let body: unknown;
	const text = await response.text();
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}

	const success =
		response.ok &&
		typeof body === "object" &&
		body !== null &&
		(body as { success?: boolean }).success !== false;

	return { ok: success, status: response.status, body };
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) {
		printHelp();
		return;
	}

	const jwt = process.env.LORESMITH_JWT || "";
	if (!jwt) {
		console.error(
			"Set LORESMITH_JWT to your session JWT (Application → Local Storage → loresmith-jwt)."
		);
		process.exit(1);
	}

	const jwtUsername = parseJwtUsername(jwt);
	const username = process.env.LORESMITH_USERNAME || jwtUsername;
	if (!username) {
		console.error(
			"Could not read username from JWT. Set LORESMITH_USERNAME explicitly."
		);
		process.exit(1);
	}
	if (
		process.env.LORESMITH_USERNAME &&
		jwtUsername &&
		process.env.LORESMITH_USERNAME !== jwtUsername
	) {
		console.error(
			`Warning: LORESMITH_USERNAME=${process.env.LORESMITH_USERNAME} differs from JWT username=${jwtUsername}. API will use JWT ownership.`
		);
	}

	const apiBase = process.env.LORESMITH_API_BASE || "https://loresmith.ai";

	let rows: FileRow[];
	if (opts.keysFile) {
		rows = loadKeysFromFile(opts.keysFile).map((file_key) => ({ file_key }));
	} else if (opts.keys.length > 0) {
		rows = opts.keys.map((file_key) => ({ file_key }));
	} else {
		rows = queryD1(username, opts.all);
	}

	console.error(`=== Found ${rows.length} file(s) for user=${username}`);
	if (rows.length === 0) {
		console.error("Nothing to do.");
		return;
	}

	for (const row of rows) {
		const meta = [
			row.file_name,
			row.status,
			row.file_size != null ? `${row.file_size}B` : null,
		]
			.filter(Boolean)
			.join(" | ");
		// stderr so status lines and keys stay ordered with other ops logs
		console.error(meta ? `${row.file_key}\t${meta}` : row.file_key);
	}

	if (opts.dryRun) {
		console.error("=== Dry-run: no POSTs sent.");
		return;
	}

	console.error(
		`=== POST trigger-indexing to ${apiBase} (delay ${opts.delayMs}ms)`
	);

	let okCount = 0;
	let failCount = 0;

	for (let i = 0; i < rows.length; i++) {
		const { file_key: fileKey } = rows[i];
		const label = `[${i + 1}/${rows.length}] ${fileKey}`;
		try {
			const result = await triggerIndexing(apiBase, jwt, fileKey);
			if (result.ok) {
				okCount++;
				console.error(`OK  ${label} status=${result.status}`, result.body);
			} else {
				failCount++;
				console.error(`FAIL ${label} status=${result.status}`, result.body);
			}
		} catch (err) {
			failCount++;
			console.error(`FAIL ${label}`, err);
		}

		if (i < rows.length - 1 && opts.delayMs > 0) {
			await sleep(opts.delayMs);
		}
	}

	console.error(`=== Done. success=${okCount} failure=${failCount}`);
	if (failCount > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
