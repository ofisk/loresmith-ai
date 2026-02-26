import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		exclude: ["**/node_modules/**", "**/.claude/**"],
		testTimeout: 30000, // 30 second timeout per test
		hookTimeout: 30000, // 30 second timeout for hooks
		setupFiles: ["./tests/setup.ts"],
		globals: true,
		// Use threads pool instead of workers pool for all tests
		// Most tests mock the Workers environment and don't need the actual workerd runtime
		// This prevents port exhaustion from creating 46+ isolated workerd runtimes
		pool: "threads",
		// Configure environment for different test types
		environmentMatchGlobs: [
			["tests/hooks/**/*.test.tsx", "jsdom"],
			["tests/components/**/*.test.tsx", "jsdom"],
		],
	},
});
