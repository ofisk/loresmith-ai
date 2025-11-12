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
    const isObject = error && typeof error === "object";
    const details = isObject
      ? {
          message: error.message,
          plugin: error.plugin ?? null,
          pluginCode: error.pluginCode ?? null,
          hook: error.hook ?? null,
          id: error.id ?? null,
          frame: error.frame ?? null,
          stack: error.stack ?? null,
          cause: error.cause ?? null,
        }
      : { error };

    console.error("[debug-build] Vite build failed with:", details);
    if (isObject && "code" in error) {
      console.error("[debug-build] error.code:", error.code);
    }
    if (isObject && "stack" in error && !details.stack) {
      console.error("[debug-build] error.stack:", error.stack);
    }
    process.exit(1);
  }
}

run();
