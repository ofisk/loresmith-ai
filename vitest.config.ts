import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  environments: {
    ssr: {
      keepProcessEnv: true,
    },
  },
  test: {
    testTimeout: 30000, // 30 second timeout per test
    hookTimeout: 30000, // 30 second timeout for hooks
    maxConcurrency: 4, // Limit concurrent test runs to prevent workerd connection exhaustion
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    environmentMatchGlobs: [
      ["tests/hooks/**/*.test.tsx", "jsdom"],
      ["tests/components/**/*.test.tsx", "jsdom"],
    ],
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
