import { build } from "vite";
import { rimraf } from "rimraf";

const pathsToClean = [
  "dist",
  ".wrangler/tmp",
  ".wrangler/build",
  ".wrangler/cache",
  ".wrangler/kv-assets",
];

async function run() {
  try {
    await Promise.all(pathsToClean.map((path) => rimraf(path)));

    process.env.DEBUG = process.env.DEBUG
      ? `${process.env.DEBUG},vite:*`
      : "vite:*";

    await build();
  } catch (error) {
    const details =
      error && typeof error === "object"
        ? {
            message: error.message,
            plugin: error.plugin ?? null,
            id: error.id ?? null,
            stack: error.stack ?? null,
          }
        : { error };
    console.error("[debug-build] Vite build failed with:", details);
    process.exit(1);
  }
}

run();
