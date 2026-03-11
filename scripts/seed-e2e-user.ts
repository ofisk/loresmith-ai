/**
 * Seed E2E test user for Playwright tests.
 * Run with: E2E_SEED_USER=1 npx tsx scripts/seed-e2e-user.ts
 * Or call from e2e-db-setup.sh when E2E_SEED_USER=1
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const E2E_USERNAME = "e2e-test-user";
const E2E_EMAIL = "e2e-test@example.com";
const E2E_PASSWORD = "e2e-test-password";
const E2E_ID = "e2e-test-user-id-00000000";

async function main() {
	if (process.env.E2E_SEED_USER !== "1") {
		console.log("[seed-e2e] E2E_SEED_USER not set, skipping");
		return;
	}
	const passwordHash = await hash(E2E_PASSWORD, 10);
	const escapedHash = passwordHash.replace(/'/g, "''");
	const sql = `
INSERT OR REPLACE INTO users (id, username, email, password_hash, email_verified_at, auth_provider, is_admin, created_at, updated_at)
VALUES (
  '${E2E_ID}',
  '${E2E_USERNAME}',
  '${E2E_EMAIL}',
  '${escapedHash}',
  datetime('now'),
  'password',
  1,
  datetime('now'),
  datetime('now')
);
`;
	const tmpFile = path.join(__dirname, ".seed-e2e-user.sql");
	fs.writeFileSync(tmpFile, sql.trim());
	try {
		execSync(
			`wrangler d1 execute loresmith-db --config wrangler.local.jsonc --local --file=${tmpFile}`,
			{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
		);
		console.log("[seed-e2e] User seeded:", E2E_USERNAME);
	} finally {
		fs.rmSync(tmpFile, { force: true });
	}
}

main().catch((err) => {
	console.error("[seed-e2e] Failed:", err);
	process.exit(1);
});
