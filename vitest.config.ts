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
    setupFiles: [],
    globals: true,
  },
  // Handle AJV compatibility issues
  optimizeDeps: {
    exclude: ["ajv"],
  },
  ssr: {
    external: ["ajv"],
  },
});
