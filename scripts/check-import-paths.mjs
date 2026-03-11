/**
 * CI check: fail if src/ contains cross-directory relative imports (../).
 * Use @/ aliases instead. Run: node scripts/check-import-paths.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const REL_IMPORT_RE = /from\s+["']\.\.\//;

function* walkDir(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name === "node_modules" || e.name === ".git") continue;
			yield* walkDir(full);
		} else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) {
			yield full;
		}
	}
}

const violations = [];
for (const filePath of walkDir(SRC)) {
	const content = fs.readFileSync(filePath, "utf8");
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (REL_IMPORT_RE.test(lines[i])) {
			const rel = path.relative(ROOT, filePath);
			violations.push({ file: rel, line: i + 1, content: lines[i].trim() });
		}
	}
}

if (violations.length > 0) {
	console.error(
		"Cross-directory relative imports found. Use @/ aliases instead:\n"
	);
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}`);
		console.error(`    ${v.content}`);
	}
	process.exit(1);
}
