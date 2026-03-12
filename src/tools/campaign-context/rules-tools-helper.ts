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
import { RULES_CONTEXT_ERRORS } from "./rules-tools-utils";

export async function withRulesContext<_T>(
	options: ToolExecuteOptions | undefined,
	campaignId: string,
	toolCallId: string,
	handler: (resolved: ResolvedRulesContext) => Promise<ToolResult>
): Promise<ToolResult> {
	const env = getEnvFromContext(options);
	if (!env) {
		return createToolError(
			RULES_CONTEXT_ERRORS.envNotAvailable,
			RULES_CONTEXT_ERRORS.envNotAvailableDetail,
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
			RULES_CONTEXT_ERRORS.resolveFailed,
			error instanceof Error ? error.message : "Unknown error",
			500,
			toolCallId
		);
	}
}
