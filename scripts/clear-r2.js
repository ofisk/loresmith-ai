#!/usr/bin/env node

/**
 * Clear all files from R2 bucket programmatically
 *
 * This script uses the Cloudflare API to delete all objects in an R2 bucket.
 *
 * Usage:
 *   node scripts/clear-r2.js [--dry-run] [--bucket-name <name>]
 *
 * Environment Variables:
 *   CLOUDFLARE_API_TOKEN: Cloudflare API token with R2 read/write permissions
 *   CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
 *   R2_BUCKET_NAME: R2 bucket name (defaults to loresmith-files)
 *
 * Or use Wrangler authentication (automatically detected)
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET_NAME = process.argv.includes("--bucket-name")
  ? process.argv[process.argv.indexOf("--bucket-name") + 1]
  : process.env.R2_BUCKET_NAME || "loresmith-files";

const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || "f67932e71175b3ee7c945c6bb84c5259";

console.log("🗂️  R2 Storage Cleanup");
console.log("======================");
console.log(`📦 Bucket: ${BUCKET_NAME}`);
console.log(`🏢 Account: ${ACCOUNT_ID}`);
if (DRY_RUN) {
  console.log("🔍 DRY RUN MODE - No files will be deleted\n");
}
console.log("");

// Check if we can use Wrangler (preferred method)
function checkWranglerAuth() {
  try {
    execSync("wrangler whoami", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Method 1: Use Wrangler R2 commands (if available)
async function clearR2WithWrangler() {
  console.log("🔄 Attempting to use Wrangler for R2 operations...");

  try {
    // List all objects first to see what we have
    console.log("📋 Listing objects in bucket...");
    let allObjects = [];
    let cursor = "";

    // Note: Wrangler doesn't have a direct "list all objects" command,
    // so we'll use the Cloudflare API method instead
    return false; // Fallback to API method
  } catch (error) {
    console.log("⚠️  Wrangler method not available, using API method");
    return false;
  }
}

// Try to get API token from Wrangler config or env files
function getWranglerApiToken() {
  try {
    // Try to read from .dev.vars or .vars
    const varsFiles = [".dev.vars", ".vars"];
    for (const file of varsFiles) {
      if (existsSync(file)) {
        try {
          const content = readFileSync(file, "utf-8");
          const match = content.match(
            /CLOUDFLARE_API_TOKEN\s*=\s*["']?([^"'\n\r]+)/
          );
          if (match && match[1]) {
            return match[1].trim();
          }
        } catch {
          // File exists but couldn't read, continue
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Method 2: Use Cloudflare API directly
async function clearR2WithAPI() {
  let API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || getWranglerApiToken();

  if (!API_TOKEN) {
    console.error("❌ Missing CLOUDFLARE_API_TOKEN environment variable");
    console.error("");
    console.error("Get your API token from:");
    console.error("  https://dash.cloudflare.com/profile/api-tokens");
    console.error("");
    console.error("Required permissions:");
    console.error("  - Account: Cloudflare R2:Edit");
    console.error("");
    console.error("Set it with:");
    console.error(`  export CLOUDFLARE_API_TOKEN='your-token-here'`);
    console.error("");
    console.error("Or add it to .dev.vars or .vars file:");
    console.error(`  CLOUDFLARE_API_TOKEN=your-token-here`);
    return false;
  }

  console.log("🔑 Using Cloudflare API...");

  const API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects`;

  let deleted = 0;
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    try {
      const url = cursor
        ? `${API_URL}?cursor=${encodeURIComponent(cursor)}`
        : API_URL;

      console.log(
        `📋 Fetching objects${cursor ? ` (cursor: ${cursor.substring(0, 10)}...)` : ""}...`
      );

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} ${error}`);
      }

      const data = await response.json();

      if (
        !data.result ||
        !data.result.objects ||
        data.result.objects.length === 0
      ) {
        hasMore = false;
        if (deleted === 0) {
          console.log("✅ No objects found in bucket");
        }
        break;
      }

      const objects = data.result.objects;
      console.log(`📊 Found ${objects.length} objects in this batch`);

      // Delete each object
      for (const obj of objects) {
        const key = obj.key;
        if (DRY_RUN) {
          console.log(`🔍 [DRY RUN] Would delete: ${key}`);
          deleted++;
        } else {
          try {
            const deleteUrl = `${API_URL}/${encodeURIComponent(key)}`;
            const deleteResponse = await fetch(deleteUrl, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${API_TOKEN}`,
              },
            });

            if (deleteResponse.ok) {
              console.log(`🗑️  Deleted: ${key}`);
              deleted++;
            } else {
              const error = await deleteResponse.text();
              console.error(
                `⚠️  Failed to delete ${key}: ${deleteResponse.status} ${error}`
              );
            }
          } catch (error) {
            console.error(`⚠️  Error deleting ${key}:`, error.message);
          }
        }
      }

      // Check for more objects
      cursor = data.result.truncated ? data.result.cursor : "";
      hasMore = data.result.truncated;

      if (!hasMore) {
        console.log("✅ Reached end of object listing");
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return false;
    }
  }

  console.log("");
  console.log("🎉 R2 cleanup completed!");
  console.log(`   📊 Total deleted: ${deleted} objects`);
  console.log("");

  return true;
}

// Method 3: Use R2 S3-compatible API directly (no AWS CLI required)
async function clearR2WithAWSCLI() {
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return false;
  }

  console.log("🔑 Using R2 S3-compatible API with credentials...");

  const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

  // Use native fetch to call S3-compatible API
  return await clearR2WithS3API(
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    ENDPOINT
  );
}

// Helper: Use S3-compatible API via fetch
async function clearR2WithS3API(accessKey, secretKey, endpoint) {
  try {
    let deleted = 0;
    let continuationToken = "";

    while (true) {
      let cmd = `${AWS_CLI_PATH} s3api list-objects-v2 --bucket "${BUCKET_NAME}" --endpoint-url "${ENDPOINT}" --output json`;
      if (continuationToken) {
        cmd += ` --continuation-token "${continuationToken}"`;
      }

      const listResult = execSync(cmd, {
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: R2_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY,
        },
        encoding: "utf-8",
        stdio: "pipe",
      });

      const data = JSON.parse(listResult);

      if (!data.Contents || data.Contents.length === 0) {
        if (deleted === 0) {
          console.log("✅ No objects found in bucket");
        }
        break;
      }

      console.log(`📊 Found ${data.Contents.length} objects in this batch`);

      // Delete each object
      for (const obj of data.Contents) {
        const key = obj.Key;
        if (DRY_RUN) {
          console.log(`🔍 [DRY RUN] Would delete: ${key}`);
          deleted++;
        } else {
          try {
            const deleteCmd = `${AWS_CLI_PATH} s3api delete-object --bucket "${BUCKET_NAME}" --key "${key}" --endpoint-url "${ENDPOINT}"`;
            execSync(deleteCmd, {
              env: {
                ...process.env,
                AWS_ACCESS_KEY_ID: R2_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY,
              },
              stdio: "pipe",
            });
            console.log(`🗑️  Deleted: ${key}`);
            deleted++;
          } catch (error) {
            console.error(`⚠️  Failed to delete ${key}`);
          }
        }
      }

      continuationToken = data.NextContinuationToken;
      if (!continuationToken) {
        break;
      }
    }

    console.log("");
    console.log("🎉 R2 cleanup completed!");
    console.log(`   📊 Total deleted: ${deleted} objects`);
    console.log("");

    return true;
  } catch (error) {
    console.error(`❌ AWS CLI error: ${error.message}`);
    return false;
  }
}

// Main execution
(async () => {
  // Try methods in order of preference
  let success = false;

  // Method 1: Try Cloudflare API (most reliable)
  if (await clearR2WithAPI()) {
    success = true;
  }
  // Method 2: Try AWS CLI (if credentials provided)
  else if (await clearR2WithAWSCLI()) {
    success = true;
  } else {
    console.error("");
    console.error("❌ Could not clear R2 bucket");
    console.error("");
    console.error("Please provide one of the following:");
    console.error("");
    console.error("Option 1: Cloudflare API Token (Recommended)");
    console.error(`  export CLOUDFLARE_API_TOKEN='your-token-here'`);
    console.error(
      "  Get token from: https://dash.cloudflare.com/profile/api-tokens"
    );
    console.error("");
    console.error("Option 2: R2 API Credentials");
    console.error(`  export R2_ACCESS_KEY_ID='your-access-key'`);
    console.error(`  export R2_SECRET_ACCESS_KEY='your-secret-key'`);
    console.error(
      "  Get credentials from: https://dash.cloudflare.com → R2 → Manage R2 API Tokens"
    );
    process.exit(1);
  }

  if (!success) {
    process.exit(1);
  }
})();
