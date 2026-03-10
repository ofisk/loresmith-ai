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
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov", "html"],
			include: ["src/lib/**"],
			exclude: [
				// Test files and config – never instrument
				"**/*.test.{ts,tsx}",
				"**/*.spec.{ts,tsx}",
				"**/tests/**",
				"**/*.d.ts",
				"**/vitest.config.ts",
				// Main app – large React root, better suited for e2e/integration tests
				"**/app.tsx",
				// Prompt templates – static strings for LLMs, no testable logic
				"**/lib/prompts/**",
				// Heavy external deps (Workers bindings, D1, R2, Durable Objects)
				"**/lib/agent-router.ts",
				"**/lib/agent-registry.ts",
				"**/lib/service-factory.ts",
				"**/lib/r2.ts",
				"**/lib/middleware.ts",
				"**/lib/durable-object-helpers.ts",
				// Env/secrets – needs Workers runtime or process.env
				"**/lib/env-utils.ts",
				// Config / constants – little or no executable logic
				"**/lib/model-manager.ts",
				"**/lib/model-config.ts",
				"**/lib/help-content.ts",
				"**/lib/rebuild-config.ts",
				"**/lib/importance-config.ts",
				"**/lib/agent-status-messages.ts",
				"**/lib/campaign-planning-checklist.ts",
				"**/lib/campaign-state-utils.ts",
				// External system wrappers – pdf, DB, HTTP
				"**/lib/file/pdf-utils.ts",
				"**/lib/db-utils.ts",
				"**/lib/api/cors.ts",
				// Auth / security – needs full request context
				"**/lib/tool-auth.ts",
				"**/lib/auth-utils.ts",
				"**/lib/proposal-security.ts",
				// Event / streaming – DOM or fetch mocks required
				"**/lib/event-bus.ts",
				"**/lib/stream-status-interceptor.ts",
				"**/lib/notifications.ts",
				"**/lib/notifications-rebuild.ts",
				// Complex orchestration – campaign ops, file upload, LLM
				"**/lib/campaign-operations.ts",
				"**/lib/file/large-file-upload-helper.ts",
				"**/lib/ai-search-utils.ts",
				"**/lib/file/processing-time-estimator.ts",
				"**/lib/explainability-builder.ts",
				"**/lib/error-parsing.ts",
			],
			thresholds: {
				lines: 50,
				functions: 50,
				branches: 50,
			},
		},
	},
});
