#!/usr/bin/env node
/**
 * Installs agent skills from skills-lock.json locally. Skipped in CI so npm ci
 * does not depend on cloning many GitHub repos or private templates.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

if (process.env.CI === "true" || process.env.CI === "1") {
	console.log("[postinstall] Skipping agent skills install (CI=true)");
	process.exit(0);
}

execSync("npx skills experimental_install --yes", {
	stdio: "inherit",
	env: process.env,
});

// `experimental_install` only targets the shared ".agents/skills" directory
// used by "universal" agents (Codex, Cursor, GitHub Copilot, ...). Claude
// Code reads skills from its own ".claude/skills" directory instead, so
// mirror the resolved skills there. This copies already-resolved skill
// folders rather than re-running `skills add --agent claude-code`, because
// that re-fetches from each skill's source repo and, for repos structured as
// multi-skill plugin marketplaces (e.g. wshobson/agents), the CLI's --skill
// filter doesn't apply and pulls in the source repo's entire skill catalog.
const universalSkillsDir = ".agents/skills";
const claudeSkillsDir = ".claude/skills";
if (existsSync(universalSkillsDir)) {
	const managed = readdirSync(universalSkillsDir);
	for (const name of managed) {
		// Replace only the skills we manage, so any hand-written skills a
		// developer keeps in .claude/skills are left alone.
		const target = join(claudeSkillsDir, name);
		rmSync(target, { recursive: true, force: true });
		cpSync(join(universalSkillsDir, name), target, { recursive: true });
	}
	console.log(
		`[postinstall] Mirrored ${managed.length} skill(s) into ${claudeSkillsDir}`
	);
}
