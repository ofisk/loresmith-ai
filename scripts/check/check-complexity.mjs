/**
 * Cyclomatic complexity gate backed by lizard (https://github.com/terryyin/lizard).
 *
 * Ratchets against complexity-baseline.json: pre-existing violations are grandfathered,
 * but a new violation or a worsened existing one fails the check.
 *
 * Run: node scripts/check/check-complexity.mjs [--staged] [--update-baseline] [paths...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "complexity-baseline.json");
const DEFAULT_PATHS = ["src", "scripts"];
const SCANNABLE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const args = process.argv.slice(2);
const stagedMode = args.includes("--staged");
const updateBaseline = args.includes("--update-baseline");
const explicitPaths = args.filter((a) => !a.startsWith("--"));

const CCN_THRESHOLD = Number(process.env.COMPLEXITY_CCN ?? 15);

function runLizard(targets) {
	if (targets.length === 0) return [];
	const lizardArgs = ["-m", "lizard", "--csv", ...targets];
	const res = spawnSync("python3", lizardArgs, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (res.error || res.status === null) {
		console.error(
			"Could not run lizard. Install it with:\n\n  python3 -m pip install --user lizard\n"
		);
		process.exit(1);
	}
	if (res.status !== 0 && !res.stdout) {
		console.error(res.stderr || "lizard exited without output");
		process.exit(1);
	}
	return parseCsv(res.stdout);
}

// lizard --csv columns: nloc,ccn,token,param,length,location,file,name,long_name,start,end
function parseCsv(text) {
	const out = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		const cells = splitCsvLine(line);
		if (cells.length < 11) continue;
		out.push({
			ccn: Number(cells[1]),
			file: normalize(cells[6]),
			name: cells[7],
			start: Number(cells[9]),
		});
	}
	return out;
}

function splitCsvLine(line) {
	const cells = [];
	let cur = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			// A doubled quote inside a quoted cell is a literal quote.
			if (quoted && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else {
				quoted = !quoted;
			}
		} else if (ch === "," && !quoted) {
			cells.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	cells.push(cur);
	return cells;
}

function normalize(file) {
	return path
		.relative(ROOT, path.resolve(ROOT, file))
		.split(path.sep)
		.join("/");
}

function collectViolations(functions) {
	const byKey = new Map();
	for (const fn of functions) {
		if (fn.ccn <= CCN_THRESHOLD) continue;
		const key = `${fn.file}::${fn.name}`;
		const entry = byKey.get(key);
		if (entry) {
			entry.count++;
			entry.ccn = Math.max(entry.ccn, fn.ccn);
			entry.lines.push(fn.start);
		} else {
			byKey.set(key, {
				file: fn.file,
				name: fn.name,
				ccn: fn.ccn,
				count: 1,
				lines: [fn.start],
			});
		}
	}
	return byKey;
}

function stagedTargets() {
	const res = spawnSync(
		"git",
		["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
		{ cwd: ROOT, encoding: "utf8" }
	);
	return res.stdout
		.split("\n")
		.map((f) => f.trim())
		.filter((f) => SCANNABLE_RE.test(f) && fs.existsSync(path.join(ROOT, f)));
}

function readBaseline() {
	if (!fs.existsSync(BASELINE_PATH)) return {};
	return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).functions ?? {};
}

function writeBaseline(violations) {
	const functions = {};
	for (const key of [...violations.keys()].sort()) {
		const v = violations.get(key);
		functions[key] = { ccn: v.ccn, count: v.count };
	}
	fs.writeFileSync(
		BASELINE_PATH,
		`${JSON.stringify({ threshold: CCN_THRESHOLD, functions }, null, "\t")}\n`
	);
	console.log(
		`Wrote ${BASELINE_PATH} with ${Object.keys(functions).length} grandfathered entries (CCN > ${CCN_THRESHOLD}).`
	);
}

const targets = stagedMode
	? stagedTargets()
	: explicitPaths.length > 0
		? explicitPaths
		: DEFAULT_PATHS;

if (stagedMode && targets.length === 0) process.exit(0);

const violations = collectViolations(runLizard(targets));

if (updateBaseline) {
	if (stagedMode || explicitPaths.length > 0) {
		console.error(
			"--update-baseline must scan the whole repo; re-run without --staged or explicit paths."
		);
		process.exit(1);
	}
	writeBaseline(violations);
	process.exit(0);
}

const baseline = readBaseline();
const failures = [];

for (const [key, v] of violations) {
	const allowed = baseline[key];
	if (!allowed) {
		failures.push({ v, reason: `new function over CCN ${CCN_THRESHOLD}` });
	} else if (v.ccn > allowed.ccn) {
		failures.push({
			v,
			reason: `complexity rose from ${allowed.ccn} to ${v.ccn}`,
		});
	} else if (v.count > allowed.count) {
		failures.push({
			v,
			reason: `${v.count} complex functions named "${v.name}" here, baseline allows ${allowed.count}`,
		});
	}
}

if (failures.length > 0) {
	console.error(
		`\nCyclomatic complexity check failed (threshold CCN > ${CCN_THRESHOLD}):\n`
	);
	for (const { v, reason } of failures) {
		console.error(`  ${v.file}:${v.lines[0]}  ${v.name}  CCN=${v.ccn}`);
		console.error(`    ${reason}`);
	}
	console.error(
		"\nSplit the function into smaller units, or extract the branching into" +
			"\nhelpers/lookup tables. To inspect it directly:" +
			`\n\n  python3 -m lizard --CCN ${CCN_THRESHOLD} ${failures[0].v.file}\n`
	);
	process.exit(1);
}

// Surface debt that has been paid down so the baseline can shrink.
const resolved = Object.keys(baseline).filter((key) => {
	const v = violations.get(key);
	return !v || v.ccn < baseline[key].ccn || v.count < baseline[key].count;
});

if (!stagedMode && resolved.length > 0) {
	console.log(
		`Complexity check passed. ${resolved.length} baseline entries improved — run \`npm run complexity:baseline\` to lock in the gains.`
	);
} else if (!stagedMode) {
	console.log(`Complexity check passed (threshold CCN > ${CCN_THRESHOLD}).`);
}
