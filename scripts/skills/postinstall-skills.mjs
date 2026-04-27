#!/usr/bin/env node
/**
 * Installs agent skills from skills-lock.json locally. Skipped in CI so npm ci
 * does not depend on cloning many GitHub repos or private templates.
 */
import { execSync } from "node:child_process";

if (process.env.CI === "true" || process.env.CI === "1") {
	console.log("[postinstall] Skipping agent skills install (CI=true)");
	process.exit(0);
}

execSync("npx skills experimental_install --yes", {
	stdio: "inherit",
	env: process.env,
});
