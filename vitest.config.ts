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
			include: ["src/lib/**", "src/hooks/**", "src/routes/**"],
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
				// Hooks – integration-heavy, need full app context
				"**/hooks/useActivityTracking.ts",
				"**/hooks/useAppAuthentication.ts",
				"**/hooks/useAppEventHandlers.ts",
				"**/hooks/useAppState.ts",
				"**/hooks/useAuthenticatedRequest.ts",
				"**/hooks/useBillingStatus.ts",
				"**/hooks/useCampaignAddition.ts",
				"**/hooks/useCampaignManagement.ts",
				"**/hooks/useCampaignRebuildStatuses.ts",
				"**/hooks/useCampaigns.ts",
				"**/hooks/useFileUpload.ts",
				"**/hooks/useGlobalShardManager.ts",
				"**/hooks/useGraphVisualization.ts",
				"**/hooks/useNotificationStream.ts",
				"**/hooks/usePlanningTasks.ts",
				"**/hooks/useProcessingProgress.ts",
				"**/hooks/useRebuildStatus.ts",
				"**/hooks/useResourceFileEvents.ts",
				"**/hooks/useRetryLimitStatus.ts",
				"**/hooks/useSessionDigests.ts",
				"**/hooks/useShardRenderGate.ts",
				"**/hooks/useTelemetryMetrics.ts",
				"**/hooks/useMenuNavigation.tsx",
				"**/hooks/useClickOutside.tsx",
				"**/hooks/useResourceFiles.ts",
				"**/hooks/useAuthReady.ts",
				// Route registration table – no testable logic
				"**/routes/register-routes.ts",
				// Route files requiring full Workers/AI runtime – tested via e2e
				"**/routes/campaign-graphrag.ts",
				"**/routes/campaign-resource-proposals.ts",
				"**/routes/campaign-share.ts",
				"**/routes/communities.ts",
				"**/routes/context-assembly.ts",
				"**/routes/entities.ts",
				"**/routes/external-resources.ts",
				"**/routes/graph-rebuild.ts",
				"**/routes/notifications.ts",
				"**/routes/onboarding.ts",
				"**/routes/planning-context.ts",
				"**/routes/planning-tasks.ts",
				"**/routes/progress.ts",
				"**/routes/rag.ts",
				"**/routes/session-digest-templates.ts",
				"**/routes/telemetry.ts",
				"**/routes/assessment.ts",
				"**/routes/chat-history.ts",
				"**/routes/file-analysis.ts",
				"**/routes/library.ts",
				// Additional routes with heavy external deps (graph, digests, etc.)
				"**/routes/graph-visualization.ts",
				"**/routes/session-digests.ts",
				"**/routes/upload-notifications.ts",
			],
			thresholds: {
				// Lowered to accommodate routes/** inclusion (routes have lower coverage)
				lines: 40,
				functions: 45,
				branches: 35,
				"src/hooks/**": {
					lines: 70,
					functions: 65,
					branches: 40,
				},
				// Auth, billing, campaigns, upload, world-state, upload-processing
				// Target 60% - currently ~26% with integration tests; add tests to reach 60%
				"src/routes/**": {
					lines: 25,
					functions: 35,
					branches: 15,
				},
			},
		},
	},
});
