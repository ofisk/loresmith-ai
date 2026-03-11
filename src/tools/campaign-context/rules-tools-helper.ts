import type { ToolResult } from "@/app-constants";
import {
	type ResolvedRulesContext,
	RulesContextService,
} from "@/services/campaign/rules-context-service";
import {
	createToolError,
	getEnvFromContext,
	type ToolExecuteOptions,
} from "@/tools/utils";

export async function withRulesContext<_T>(
	options: ToolExecuteOptions | undefined,
	campaignId: string,
	toolCallId: string,
	handler: (resolved: ResolvedRulesContext) => Promise<ToolResult>
): Promise<ToolResult> {
	const env = getEnvFromContext(options);
	if (!env) {
		return createToolError(
			"Environment not available",
			"Direct database access is required for campaign rules resolution.",
			500,
			toolCallId
		);
	}

	try {
		const resolved = await RulesContextService.getResolvedRulesContext(
			env,
			campaignId
		);
		return await handler(resolved);
	} catch (error) {
		return createToolError(
			"Failed to resolve campaign rules context",
			error instanceof Error ? error.message : "Unknown error",
			500,
			toolCallId
		);
	}
}
