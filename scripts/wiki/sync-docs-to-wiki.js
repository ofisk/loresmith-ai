#!/usr/bin/env node

/**
 * Sync documentation to GitHub Wiki
 *
 * This script clones the GitHub wiki repository, syncs documentation files,
 * and pushes changes back to GitHub.
 *
 * Usage:
 *   node scripts/wiki/sync-docs-to-wiki.js [--dry-run] [--wiki-url <url>]
 *
 * Environment Variables:
 *   GITHUB_TOKEN: Personal access token with repo scope (optional, uses git auth if not set)
 */

import { execSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const REPO_OWNER = "ofisk";
const REPO_NAME = "loresmith-ai";
// Use SSH URL if available, fallback to HTTPS
const USE_SSH = process.argv.includes("--ssh") || true; // Default to SSH
const WIKI_URL = USE_SSH
	? `git@github.com:${REPO_OWNER}/${REPO_NAME}.wiki.git`
	: `https://github.com/${REPO_OWNER}/${REPO_NAME}.wiki.git`;
const WIKI_DIR = ".wiki-temp";
const DOCS_DIR = "docs";
const DRY_RUN = process.argv.includes("--dry-run");

// File mappings: source -> wiki destination
const FILE_MAPPINGS = [
	{ src: "README.md", dest: "Home.md", process: true },
	{ src: "docs/USER_GUIDE.md", dest: "User-Guide.md", process: true },
	{ src: "docs/FEATURES.md", dest: "Features.md", process: true },
	{ src: "docs/ARCHITECTURE.md", dest: "Architecture.md", process: true },
	{ src: "docs/API.md", dest: "API-Reference.md", process: true },
	{ src: "docs/DEV_SETUP.md", dest: "Developer-Setup.md", process: true },
	{ src: "docs/LIMITS.md", dest: "Limits.md", process: true },
	{ src: "docs/TESTING_GUIDE.md", dest: "Testing-Guide.md", process: true },
	{ src: "docs/CONTRIBUTING.md", dest: "Contributing.md", process: true },
	// Technical docs
	{
		src: "docs/GRAPHRAG_INTEGRATION.md",
		dest: "Technical/GraphRAG-Integration.md",
		process: true,
	},
	{
		src: "docs/AUTHENTICATION_FLOW.md",
		dest: "Technical/Authentication-Flow.md",
		process: true,
	},
	{
		src: "docs/STORAGE_STRATEGY.md",
		dest: "Technical/Storage-Strategy.md",
		process: true,
	},
	{
		src: "docs/FILE_ANALYSIS_SYSTEM.md",
		dest: "Technical/File-Analysis-System.md",
		process: true,
	},
	{
		src: "docs/MODEL_CONFIGURATION.md",
		dest: "Technical/Model-Configuration.md",
		process: true,
	},
	{
		src: "docs/CHECKLIST_STATUS_SYSTEM.md",
		dest: "Technical/Checklist-Status-System.md",
		process: true,
	},
	{
		src: "docs/ENTITY_SEARCH_CACHING.md",
		dest: "Technical/Entity-Search-Caching.md",
		process: true,
	},
	{
		src: "docs/LIBRARY_ENTITY_PIPELINE.md",
		dest: "Technical/Library-Entity-Pipeline.md",
		process: true,
	},
	{
		src: "docs/LLM_BATCH_PROCESSING.md",
		dest: "Technical/LLM-Batch-Processing.md",
		process: true,
	},
	{
		src: "docs/FILE_UPLOAD_SYSTEM.md",
		dest: "Technical/File-Upload-System.md",
		process: true,
	},
	{
		src: "docs/DEPLOYMENT.md",
		dest: "Deployment.md",
		process: true,
	},
	{
		src: "docs/DATABASE_MIGRATIONS.md",
		dest: "Technical/Database-Migrations.md",
		process: true,
	},
	{
		src: "docs/CAMPAIGN_SHARD_FLOW.md",
		dest: "Technical/Campaign-Shard-Flow.md",
		process: true,
	},
	{
		src: "docs/database/d1-indexes.md",
		dest: "Technical/D1-Indexes.md",
		process: true,
	},
	{
		src: "docs/AGENT_DESIGN.md",
		dest: "Technical/Agent-Design.md",
		process: true,
	},
	{
		src: "docs/TOOL_SYSTEM.md",
		dest: "Technical/Tool-System.md",
		process: true,
	},
	{
		src: "docs/TOOL_PATTERNS.md",
		dest: "Technical/Tool-Patterns.md",
		process: true,
	},
	{
		src: "docs/CONTINUITY_CHECKER.md",
		dest: "Technical/Continuity-Checker.md",
		process: true,
	},
	{
		src: "docs/PLAYER_RECAP_EMAILS.md",
		dest: "Technical/Player-Recap-Emails.md",
		process: true,
	},
	{
		src: "docs/SESSION_RUNSHEET.md",
		dest: "Technical/Session-Runsheet.md",
		process: true,
	},
	{
		src: "docs/LARGE_FILE_SUPPORT.md",
		dest: "Technical/Large-File-Support.md",
		process: true,
	},
	{
		src: "docs/DAO_LAYER.md",
		dest: "Technical/DAO-Layer.md",
		process: true,
	},
	{
		src: "docs/EVENT_BUS_ARCHITECTURE.md",
		dest: "Technical/Event-Bus-Architecture.md",
		process: true,
	},
	{
		src: "docs/EVENT_BUS_GUIDE.md",
		dest: "Technical/Event-Bus-Guide.md",
		process: true,
	},
	{
		src: "docs/NOTIFICATION_SYSTEM.md",
		dest: "Technical/Notification-System.md",
		process: true,
	},
	{
		src: "docs/ASSESSMENT_SYSTEM.md",
		dest: "Technical/Assessment-System.md",
		process: true,
	},
	{
		src: "docs/SHARD_APPROVAL_SYSTEM.md",
		dest: "Technical/Shard-Approval-System.md",
		process: true,
	},
	{
		src: "docs/SHARD_UI_COMPONENTS.md",
		dest: "Technical/Shard-UI-Components.md",
		process: true,
	},
	{
		src: "docs/COMMUNITY_DETECTION_MEMORY.md",
		dest: "Technical/Community-Detection-Memory.md",
		process: true,
	},
	// Operations
	{
		src: "docs/CLEAR_PRODUCTION_DATA.md",
		dest: "Clear-Production-Data.md",
		process: true,
	},
];

/**
 * Map docs/ relative paths (e.g. API.md, database/d1-indexes.md) to the wiki
 * page names to link to.
 *
 * GitHub flattens wiki page paths: `Technical/Tool-System.md` is published as
 * the page `Tool-System`, and `/wiki/Technical/Tool-System` 404s. `[[a/b|c]]`
 * wiki-links are resolved by GitHub and tolerate the folder, but `[text](a/b)`
 * is a plain relative URL the browser resolves against the current page — so
 * markdown links must use the flattened name, without the folder prefix.
 */
function buildDocsToWikiLinkMap() {
	const map = new Map();
	const takenBy = new Map();
	for (const { src, dest } of FILE_MAPPINGS) {
		if (!src.startsWith("docs/")) {
			continue;
		}
		const rel = src.slice("docs/".length);
		const wikiPath = dest.replace(/\.md$/, "").split("/").pop();
		// Because names flatten, two mappings in different folders that share a
		// basename would resolve to the same wiki page. Fail loudly rather than
		// publish links that silently point at the wrong page.
		if (takenBy.has(wikiPath)) {
			throw new Error(
				`Wiki page name collision: "${dest}" and "${takenBy.get(wikiPath)}" both flatten to "${wikiPath}"`
			);
		}
		takenBy.set(wikiPath, dest);
		map.set(rel, wikiPath);
	}
	return map;
}

function exec(cmd, options = {}) {
	if (DRY_RUN) {
		console.log(`[DRY RUN] Would execute: ${cmd}`);
		return "";
	}
	return execAlways(cmd, options);
}

/**
 * Run a command even under --dry-run. Only for commands that leave the wiki
 * repository untouched (e.g. the initial clone), which the dry run still needs
 * in order to diff the local docs against the published pages.
 */
function execAlways(cmd, options = {}) {
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: "inherit", ...options });
	} catch (error) {
		console.error(`Error executing: ${cmd}`);
		throw error;
	}
}

function processMarkdown(content, isHomePage = false) {
	// Convert relative links to wiki-friendly links
	let processed = content;
	const docsLinkMap = buildDocsToWikiLinkMap();

	// Same-directory links from docs/ files: [t](FILE.md) or [t](./FILE.md) or [t](./sub/file.md)
	for (const [relDocPath, wikiPath] of docsLinkMap) {
		const escaped = relDocPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		processed = processed.replace(
			new RegExp(`\\[([^\\]]+)\\]\\(${escaped}\\)`, "g"),
			`[$1](${wikiPath})`
		);
		processed = processed.replace(
			new RegExp(`\\[([^\\]]+)\\]\\(\\.\\/${escaped}\\)`, "g"),
			`[$1](${wikiPath})`
		);
	}

	// Convert docs/ links to wiki links (unmapped paths fall back to title-cased name)
	processed = processed.replace(
		/\[([^\]]+)\]\(docs\/([^)]+\.md)\)/g,
		(_match, text, file) => {
			if (docsLinkMap.has(file)) {
				return `[${text}](${docsLinkMap.get(file)})`;
			}
			const wikiName = file
				.replace(/\.md$/, "")
				.replace(/_/g, "-")
				.replace(/\b\w/g, (l) => l.toUpperCase());
			return `[${text}](${wikiName})`;
		}
	);

	// Fix relative image paths if needed
	processed = processed.replace(/\]\(\.\.\/\.\.\/([^)]+)\)/g, "]($1)");

	// Convert docs/images/ paths to images/ for wiki (from README.md and other root files)
	processed = processed.replace(/\]\(docs\/images\/([^)]+)\)/g, "](images/$1)");

	// Ensure images/ paths work correctly - they should already be correct
	// GitHub wiki uses relative paths from the page, so images/filename.png should work
	// if images are in the wiki/images/ directory

	// Remove the title from Home.md (first line with #)
	if (isHomePage) {
		processed = processed.replace(/^#\s+[^\n]+\n\n/, "");
	}

	return processed;
}

function createSidebar() {
	return `## Getting Started
- [[Home|Home]]
- [[User-Guide|User Guide]]
- [[Features|Features]]

## For Developers
- [[Developer-Setup|Developer Setup]]
- [[Architecture|Architecture]]
- [[API-Reference|API Reference]]
- [[Testing-Guide|Testing Guide]]
- [[Contributing|Contributing]]

## Agents & Tools
- [[Technical/Agent-Design|Agent design]]
- [[Technical/Tool-System|Tool system]]
- [[Technical/Tool-Patterns|Tool patterns]]

## Campaign Features
- [[Technical/Campaign-Shard-Flow|Campaign shard flow]]
- [[Technical/Shard-Approval-System|Shard approval system]]
- [[Technical/Shard-UI-Components|Shard UI components]]
- [[Technical/Continuity-Checker|Continuity checker]]
- [[Technical/Session-Runsheet|Session runsheet]]
- [[Technical/Player-Recap-Emails|Player recap emails]]
- [[Technical/Assessment-System|Assessment system]]
- [[Technical/Checklist-Status-System|Checklist status system]]

## Content Pipeline
- [[Technical/GraphRAG-Integration|GraphRAG Integration]]
- [[Technical/Library-Entity-Pipeline|Library entity pipeline]]
- [[Technical/LLM-Batch-Processing|LLM batch processing]]
- [[Technical/File-Upload-System|File upload system]]
- [[Technical/File-Analysis-System|File analysis system]]
- [[Technical/Large-File-Support|Large file support]]
- [[Technical/Community-Detection-Memory|Community detection memory]]
- [[Technical/Entity-Search-Caching|Entity search caching]]

## Platform
- [[Technical/Authentication-Flow|Authentication Flow]]
- [[Technical/Storage-Strategy|Storage Strategy]]
- [[Technical/DAO-Layer|DAO layer]]
- [[Technical/Event-Bus-Architecture|Event bus architecture]]
- [[Technical/Event-Bus-Guide|Event bus guide]]
- [[Technical/Notification-System|Notification system]]
- [[Technical/Model-Configuration|Model Configuration]]
- [[Technical/D1-Indexes|D1 indexes]]

## Operations
- [[Deployment|Deployment]]
- [[Technical/Database-Migrations|Database migrations]]
- [[Limits|Limits]]
- [[Clear-Production-Data|Clear production data]]
`;
}

console.log("📚 Syncing documentation to GitHub Wiki...");
console.log("");

if (DRY_RUN) {
	console.log("🔍 DRY RUN MODE - No changes will be committed or pushed\n");
}

// Check if we're in the right directory
if (!existsSync(DOCS_DIR)) {
	console.error("❌ Error: docs/ directory not found");
	console.error("Please run this script from the project root");
	process.exit(1);
}

// Clean up any existing wiki clone
if (existsSync(WIKI_DIR)) {
	console.log("🧹 Cleaning up existing wiki clone...");
	rmSync(WIKI_DIR, { recursive: true, force: true });
}

// Clone the wiki repository. This runs under --dry-run too: the dry run needs a
// real checkout to diff against, and cloning changes nothing on the remote.
console.log("📥 Cloning wiki repository...");
try {
	execAlways(`git clone "${WIKI_URL}" "${WIKI_DIR}"`, { stdio: "pipe" });
} catch (_error) {
	console.error("❌ Failed to clone wiki repository");
	console.error("");
	console.error("Note: The wiki must be initialized on GitHub first.");
	console.error(
		`Go to https://github.com/${REPO_OWNER}/${REPO_NAME}/settings and enable the Wiki feature.`
	);
	process.exit(1);
}

// Change to wiki directory
const originalCwd = process.cwd();
process.chdir(WIKI_DIR);

try {
	// Create Technical directory if it doesn't exist
	if (!existsSync("Technical")) {
		mkdirSync("Technical", { recursive: true });
	}

	// Copy and process files
	console.log("📋 Copying and processing documentation files...");

	for (const mapping of FILE_MAPPINGS) {
		const srcPath = join("..", mapping.src);

		if (!existsSync(srcPath)) {
			console.log(`⚠️  Skipping ${mapping.src} (not found)`);
			continue;
		}

		const content = readFileSync(srcPath, "utf-8");
		const processed = mapping.process
			? processMarkdown(content, mapping.dest === "Home.md")
			: content;

		// Ensure directory exists
		const destDir = mapping.dest.split("/").slice(0, -1).join("/");
		if (destDir && !existsSync(destDir)) {
			mkdirSync(destDir, { recursive: true });
		}

		writeFileSync(mapping.dest, processed);
		console.log(`✅ Copied ${mapping.src} → ${mapping.dest}`);
	}

	// Copy images directory if it exists
	const imagesSourceDir = join("..", DOCS_DIR, "images");
	const imagesDestDir = "images";
	if (existsSync(imagesSourceDir)) {
		console.log("🖼️  Copying images...");
		if (!existsSync(imagesDestDir)) {
			mkdirSync(imagesDestDir, { recursive: true });
		}
		// Copy all files from docs/images/ to wiki/images/
		// Exclude README.md from images directory
		const imageFiles = readdirSync(imagesSourceDir).filter(
			(file) =>
				file !== "README.md" &&
				!statSync(join(imagesSourceDir, file)).isDirectory()
		);
		for (const file of imageFiles) {
			const srcFile = join(imagesSourceDir, file);
			const destFile = join(imagesDestDir, file);
			cpSync(srcFile, destFile, { recursive: false });
			console.log(`✅ Copied image: ${file}`);
		}
		if (imageFiles.length === 0) {
			console.log("⚠️  No image files found in docs/images/");
		}
	} else {
		console.log("⚠️  Images directory not found (docs/images/)");
	}

	// Create or update sidebar
	const sidebarPath = "_Sidebar.md";
	const sidebarContent = createSidebar();
	if (
		!existsSync(sidebarPath) ||
		readFileSync(sidebarPath, "utf-8") !== sidebarContent
	) {
		writeFileSync(sidebarPath, sidebarContent);
		console.log("✅ Created/updated _Sidebar.md");
	}

	// Check for changes
	let status = "";
	try {
		status = execSync("git status --porcelain", {
			encoding: "utf-8",
			stdio: "pipe",
		});
	} catch (_error) {
		// Git status might return non-zero in some cases, but we'll check the output
		status = "";
	}

	if (!status.trim()) {
		console.log("");
		console.log("✅ No changes to commit. Wiki is up to date.");
		process.chdir(originalCwd);
		rmSync(WIKI_DIR, { recursive: true, force: true });
		process.exit(0);
	}

	console.log("");
	console.log("📊 Changes to be committed:");
	console.log(status);
	console.log("");

	if (DRY_RUN) {
		console.log("🔍 DRY RUN: Would commit and push changes");
	} else {
		// Commit changes
		exec("git add .");
		exec(`git commit -m "Update wiki documentation from docs/ directory

- Sync user guide, features, and architecture documentation
- Update API reference and developer guides
- Sync technical documentation
- Auto-generated from project documentation"`);

		console.log("");
		console.log("📤 Pushing changes to GitHub...");

		try {
			// Detect the current branch
			let branch = "master";
			try {
				branch = execSync("git rev-parse --abbrev-ref HEAD", {
					encoding: "utf-8",
					stdio: "pipe",
				}).trim();
			} catch {
				// Fallback to master if detection fails
				branch = "master";
			}

			// Try to push
			exec(`git push origin ${branch}`);
			console.log("");
			console.log("✅ Successfully synced documentation to GitHub Wiki!");
			console.log(
				`   View at: https://github.com/${REPO_OWNER}/${REPO_NAME}/wiki`
			);
		} catch (error) {
			console.error("");
			console.error("❌ Failed to push to wiki repository");
			console.error("");
			console.error("This usually means git authentication is needed.");
			console.error("");
			console.error("Solutions:");
			console.error("1. Use SSH instead of HTTPS:");
			console.error(
				`   git remote set-url origin git@github.com:${REPO_OWNER}/${REPO_NAME}.wiki.git`
			);
			console.error("");
			console.error("2. Or configure HTTPS credentials:");
			console.error("   git config --global credential.helper store");
			console.error(
				"   (then enter your GitHub username and Personal Access Token)"
			);
			console.error("");
			console.error("3. Or manually push from the wiki directory:");
			console.error(`   cd .wiki-temp && git push origin ${branch}`);
			console.error("");
			throw error;
		}
	}
} finally {
	process.chdir(originalCwd);
	rmSync(WIKI_DIR, { recursive: true, force: true });
}
