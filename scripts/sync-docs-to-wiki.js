#!/usr/bin/env node

/**
 * Sync documentation to GitHub Wiki
 *
 * This script clones the GitHub wiki repository, syncs documentation files,
 * and pushes changes back to GitHub.
 *
 * Usage:
 *   node scripts/sync-docs-to-wiki.js [--dry-run] [--wiki-url <url>]
 *
 * Environment Variables:
 *   GITHUB_TOKEN: Personal access token with repo scope (optional, uses git auth if not set)
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join } from "path";

const REPO_OWNER = "ofisk";
const REPO_NAME = "loresmith-ai";
const WIKI_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.wiki.git`;
const WIKI_DIR = ".wiki-temp";
const DOCS_DIR = "docs";
const DRY_RUN = process.argv.includes("--dry-run");

// File mappings: source -> wiki destination
const FILE_MAPPINGS = [
  { src: "README.md", dest: "Home.md", process: true },
  { src: "docs/USER_GUIDE.md", dest: "User-Guide.md" },
  { src: "docs/FEATURES.md", dest: "Features.md" },
  { src: "docs/ARCHITECTURE.md", dest: "Architecture.md" },
  { src: "docs/API.md", dest: "API-Reference.md" },
  { src: "docs/DEV_SETUP.md", dest: "Developer-Setup.md" },
  { src: "docs/TESTING_GUIDE.md", dest: "Testing-Guide.md" },
  { src: "docs/CONTRIBUTING.md", dest: "Contributing.md" },
  // Technical docs
  {
    src: "docs/GRAPHRAG_INTEGRATION.md",
    dest: "Technical/GraphRAG-Integration.md",
  },
  {
    src: "docs/AUTHENTICATION_FLOW.md",
    dest: "Technical/Authentication-Flow.md",
  },
  { src: "docs/STORAGE_STRATEGY.md", dest: "Technical/Storage-Strategy.md" },
  {
    src: "docs/FILE_ANALYSIS_SYSTEM.md",
    dest: "Technical/File-Analysis-System.md",
  },
  {
    src: "docs/MODEL_CONFIGURATION.md",
    dest: "Technical/Model-Configuration.md",
  },
];

function exec(cmd, options = {}) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would execute: ${cmd}`);
    return "";
  }
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

  // Convert docs/ links to wiki links
  processed = processed.replace(
    /\[([^\]]+)\]\(docs\/([^)]+\.md)\)/g,
    (match, text, file) => {
      // Convert file path to wiki page name
      const wikiName = file
        .replace(/\.md$/, "")
        .replace(/_/g, "-")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      return `[${text}](${wikiName})`;
    }
  );

  // Fix relative image paths if needed
  processed = processed.replace(/\]\(\.\.\/\.\.\/([^)]+)\)/g, "]($1)");

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

## Technical Documentation
- [[Technical/GraphRAG-Integration|GraphRAG Integration]]
- [[Technical/Authentication-Flow|Authentication Flow]]
- [[Technical/Storage-Strategy|Storage Strategy]]
- [[Technical/File-Analysis-System|File Analysis System]]
- [[Technical/Model-Configuration|Model Configuration]]
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
  if (!DRY_RUN) {
    rmSync(WIKI_DIR, { recursive: true, force: true });
  }
}

// Clone the wiki repository
console.log("📥 Cloning wiki repository...");
try {
  exec(`git clone "${WIKI_URL}" "${WIKI_DIR}"`, { stdio: "pipe" });
} catch (error) {
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
  } catch (error) {
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
      exec("git push origin main || git push origin master");
      console.log("");
      console.log("✅ Successfully synced documentation to GitHub Wiki!");
      console.log(
        `   View at: https://github.com/${REPO_OWNER}/${REPO_NAME}/wiki`
      );
    } catch (error) {
      console.error("");
      console.error("❌ Failed to push to wiki repository");
      console.error("");
      console.error("You may need to:");
      console.error("1. Configure git credentials");
      console.error("2. Enable wiki write access");
      console.error("3. Check your GitHub authentication");
      throw error;
    }
  }
} finally {
  process.chdir(originalCwd);
  if (!DRY_RUN) {
    rmSync(WIKI_DIR, { recursive: true, force: true });
  }
}
