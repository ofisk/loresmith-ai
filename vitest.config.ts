import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  environments: {
    ssr: {
      keepProcessEnv: true,
    },
  },
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    environmentMatchGlobs: [["tests/hooks/**/*.test.tsx", "jsdom"]],
    // Add compatibility settings for ESM/CJS issues
    setupFiles: [],
    globals: true,
  },
  // Add Vite configuration for better ESM/CJS compatibility
  optimizeDeps: {
    exclude: ["ajv"],
  },
  ssr: {
    noExternal: ["ajv"],
  },
});
