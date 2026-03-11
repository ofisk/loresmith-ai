/**
 * Codemod: convert cross-directory relative imports (../) to @/ aliases.
 * Same-directory imports (./) are left unchanged.
 * Run from project root: node scripts/standardize-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// Match: from "..." or from '...' where path starts with ../
const REL_IMPORT_RE = /from\s+(["'])(\.\.\/[^"']+)\1/g;

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

function convertImport(filePath, importPath, quote) {
	const dir = path.dirname(filePath);
	// Resolve the target (may not exist yet; we're doing string math)
	const resolved = path.resolve(dir, importPath);
	const relative = path.relative(SRC, resolved);
	if (relative.startsWith("..")) {
		// Import points outside src/ - shouldn't happen for ../ imports from within src/
		return null;
	}
	const aliasPath = relative.replace(/\\/g, "/");
	// Strip .ts/.tsx extension for cleaner imports (TS resolves)
	const withoutExt = aliasPath.replace(/\.(tsx?)$/, "");
	return `from ${quote}@/${withoutExt}${quote}`;
}

let totalReplacements = 0;
let filesModified = 0;

for (const filePath of walkDir(SRC)) {
	const content = fs.readFileSync(filePath, "utf8");
	let newContent = content;
	let modified = false;

	newContent = newContent.replace(REL_IMPORT_RE, (match, quote, importPath) => {
		const replacement = convertImport(filePath, importPath, quote);
		if (replacement) {
			modified = true;
			totalReplacements++;
			return replacement;
		}
		return match;
	});

	if (modified) {
		fs.writeFileSync(filePath, newContent, "utf8");
		filesModified++;
	}
}

console.log(
	`Standardized imports: ${totalReplacements} replacements in ${filesModified} files`
);
