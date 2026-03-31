#!/usr/bin/env node
/**
 * wrangler.local.jsonc serves static assets from dist/client. If that folder
 * is missing (fresh clone, after npm run clean), wrangler dev fails with
 * ENOENT on dist/client and may leave a broken .wrangler bundle.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = path.join(root, "dist/client/index.html");

if (process.env.SKIP_ENSURE_DIST === "1") {
	process.exit(0);
}

if (fs.existsSync(indexHtml)) {
	process.exit(0);
}

console.warn(
	"dist/client missing — running npm run build so Wrangler can serve assets.\n" +
		"(Use SKIP_ENSURE_DIST=1 to skip; UI with HMR: npm start in another terminal.)\n"
);

const result = spawnSync("npm", ["run", "build"], {
	cwd: root,
	stdio: "inherit",
	shell: true,
});

process.exit(result.status ?? 1);
