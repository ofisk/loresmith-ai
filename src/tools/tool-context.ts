/**
 * Tool execution context – env and DAO factory.
 * Enables dependency injection for testing: pass mock context instead of resolving from options.
 */

import type { DAOFactory } from "@/dao/dao-factory";
import { getDAOFactory } from "@/dao/dao-factory";
import type { ToolEnv } from "./utils";
import { getEnvFromContext } from "./utils";

export interface ToolContext {
	env: ToolEnv;
	daoFactory: DAOFactory;
}

export interface ToolContextResult {
	ok: true;
	context: ToolContext;
}

export interface ToolContextError {
	ok: false;
	error: { message: string; detail: string; code: number };
}

export type ResolveToolContextResult = ToolContextResult | ToolContextError;

/**
 * Resolve tool context (env, daoFactory) from options.
 * Returns error result when env is not available.
 * For tests, pass context directly to core logic to bypass resolution.
 */
export function resolveToolContext(
	options: unknown,
	_toolCallId: string,
	errorMessages: { notAvailable: string; detail: string } = {
		notAvailable: "Environment not available",
		detail: "Direct database access is required.",
	}
): ResolveToolContextResult {
	const env = getEnvFromContext(options);
	if (!env) {
		return {
			ok: false,
			error: {
				message: errorMessages.notAvailable,
				detail: errorMessages.detail,
				code: 500,
			},
		};
	}
	const daoFactory = getDAOFactory(env);
	return {
		ok: true,
		context: { env, daoFactory },
	};
}
