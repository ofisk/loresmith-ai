/**
 * Initial-JS bundle size gate.
 *
 * "Initial JS" is the entry chunk referenced by dist/client/index.html plus
 * every chunk it reaches through *static* imports — i.e. what a browser must
 * download and parse before the app is interactive. Lazily-imported chunks
 * (cytoscape, pdf-lib, ...) are deliberately excluded; keeping them out is the
 * whole point of the gate.
 *
 * Two independent checks run:
 *   1. Size ratchet against bundle-size-baseline.json (gzipped bytes, with a
 *      small tolerance so ordinary churn does not fail CI).
 *   2. A denylist of heavy dependencies that must never reappear in the
 *      initial set. This is the check that actually catches regressions: a
 *      single stray `import { FileDAO } from "@/dao"` re-bridges the client to
 *      the server service graph and silently drags in megabytes.
 *
 * Run: node scripts/check/check-bundle-size.mjs [--update-baseline]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIST = path.join(ROOT, "dist", "client");
const BASELINE_PATH = path.join(ROOT, "bundle-size-baseline.json");

const updateBaseline = process.argv.slice(2).includes("--update-baseline");

/** Growth allowed before the gate fails. */
const TOLERANCE = 0.05;

/**
 * Substrings that must not appear in any initial chunk. These are markers that
 * survive minification (package-internal identifiers / strings), not bare
 * package names, so they do not false-positive on a stray comment.
 */
const DENYLIST = [
	{ dep: "cytoscape", markers: ["cytoscape"] },
	{ dep: "mammoth", markers: ["mammoth"] },
	{ dep: "pdfjs-serverless", markers: ["pdfjs"] },
	{ dep: "pdf-lib", markers: ["pdf-lib", "PDFDocument"] },
];

function fail(msg) {
	console.error(`\n✖ ${msg}\n`);
	process.exit(1);
}

if (!fs.existsSync(DIST)) {
	fail(
		`No build found at ${path.relative(ROOT, DIST)}. Run \`npm run build\` first.`
	);
}

/** The entry chunk is whatever index.html loads as a module. */
function findEntryChunk() {
	const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
	const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
	if (!m)
		fail("Could not find the module <script> tag in dist/client/index.html.");
	return m[1].replace(/^\//, "");
}

/**
 * Collect the entry chunk plus everything it statically imports, transitively.
 * Rolldown emits relative specifiers, so resolve them against the chunk's dir.
 * `import(...)` calls are intentionally not followed — those are the lazy
 * boundaries we are trying to preserve.
 */
function collectInitialChunks(entryRel) {
	const seen = new Set();
	const queue = [entryRel];
	while (queue.length) {
		const rel = queue.shift();
		if (seen.has(rel)) continue;
		const abs = path.join(DIST, rel);
		if (!fs.existsSync(abs)) continue;
		seen.add(rel);

		const src = fs.readFileSync(abs, "utf8");
		// Static `import ... from "./x.js"`, `import "./x.js"`, `export ... from "./x.js"`.
		const re = /(?:^|[\s;}])(?:import|export)\b[^;'"]*?["'](\.[^"']+\.js)["']/g;
		for (const m of src.matchAll(re)) {
			queue.push(path.normalize(path.join(path.dirname(rel), m[1])));
		}
	}
	return [...seen].sort();
}

const entry = findEntryChunk();
const initial = collectInitialChunks(entry);

let rawBytes = 0;
let gzipBytes = 0;
const perChunk = [];
for (const rel of initial) {
	const buf = fs.readFileSync(path.join(DIST, rel));
	const gz = gzipSync(buf).length;
	rawBytes += buf.length;
	gzipBytes += gz;
	perChunk.push({ chunk: rel, raw: buf.length, gzip: gz });
}

// --- Report -----------------------------------------------------------------
console.log("Initial JS chunks (entry + static imports):");
for (const c of perChunk.sort((a, b) => b.gzip - a.gzip)) {
	console.log(
		`  ${String(Math.round(c.gzip / 1024)).padStart(6)} kB gzip  ${c.chunk}`
	);
}
console.log(
	`\n  total: ${(rawBytes / 1024).toFixed(1)} kB raw / ${(gzipBytes / 1024).toFixed(1)} kB gzip\n`
);

// --- Denylist ---------------------------------------------------------------
const initialSource = initial
	.map((rel) => fs.readFileSync(path.join(DIST, rel), "utf8"))
	.join("\n");

const leaked = DENYLIST.filter(({ markers }) =>
	markers.some((marker) => initialSource.includes(marker))
).map(({ dep }) => dep);

// --- Baseline ---------------------------------------------------------------
if (updateBaseline) {
	fs.writeFileSync(
		BASELINE_PATH,
		`${JSON.stringify(
			{
				description:
					"Initial JS budget for the client bundle. Update deliberately via `npm run bundle:size:baseline`.",
				tolerance: TOLERANCE,
				initialJs: { rawBytes, gzipBytes },
			},
			null,
			"\t"
		)}\n`
	);
	console.log(`Baseline written to ${path.relative(ROOT, BASELINE_PATH)}.`);
	if (leaked.length) {
		fail(
			`Refusing to bless a baseline that contains lazy-only dependencies: ${leaked.join(", ")}.`
		);
	}
	process.exit(0);
}

if (leaked.length) {
	fail(
		`These dependencies must stay out of the initial bundle but were found in it: ${leaked.join(", ")}.\n` +
			"  They are meant to load on demand. A new static import chain has re-introduced them —\n" +
			"  a common cause is importing a value from a barrel (e.g. `@/dao`) or from a module that\n" +
			"  mixes browser and server code (e.g. `@/services/core/auth-service`)."
	);
}

if (!fs.existsSync(BASELINE_PATH)) {
	fail(
		`No baseline at ${path.relative(ROOT, BASELINE_PATH)}. Create it with \`npm run bundle:size:baseline\`.`
	);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const limit = Math.round(baseline.initialJs.gzipBytes * (1 + TOLERANCE));

if (gzipBytes > limit) {
	fail(
		`Initial JS grew to ${(gzipBytes / 1024).toFixed(1)} kB gzip, over the ` +
			`${(limit / 1024).toFixed(1)} kB limit ` +
			`(baseline ${(baseline.initialJs.gzipBytes / 1024).toFixed(1)} kB + ${TOLERANCE * 100}%).\n` +
			"  Prefer a dynamic import() for whatever grew. If the growth is intended,\n" +
			"  re-bless the budget with `npm run bundle:size:baseline`."
	);
}

const delta = gzipBytes - baseline.initialJs.gzipBytes;
const pct = ((delta / baseline.initialJs.gzipBytes) * 100).toFixed(1);
console.log(
	`✔ Within budget (${delta >= 0 ? "+" : ""}${(delta / 1024).toFixed(1)} kB / ${delta >= 0 ? "+" : ""}${pct}% vs baseline).`
);
