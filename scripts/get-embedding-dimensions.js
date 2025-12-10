#!/usr/bin/env node

// Simple script to extract embedding dimensions constant for use in shell scripts
// This ensures shell scripts use the same dimension value as the TypeScript code

const fs = require("fs");
const path = require("path");

const sourceFile = path.join(
  __dirname,
  "../src/services/embedding/openai-embedding-service.ts"
);

try {
  const content = fs.readFileSync(sourceFile, "utf8");

  // Extract the constant value from the source file
  const match = content.match(/const EXPECTED_DIMENSIONS = (\d+)/);
  if (match && match[1]) {
    console.log(match[1]);
    process.exit(0);
  }

  throw new Error("Could not find EXPECTED_DIMENSIONS constant");
} catch (error) {
  console.error("Error extracting EXPECTED_DIMENSIONS:", error.message);
  process.exit(1);
}
