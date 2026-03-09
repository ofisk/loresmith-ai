/**
 * Utility functions for environment variable access
 */

import type { ToolResult } from "@/app-constants";
import {
	DatabaseConnectionError,
	EnvironmentVariableError,
	LLMProviderAPIKeyError,
	SecretStoreAccessError,
	VectorizeIndexRequiredError,
} from "@/lib/errors";
import { createLogger } from "@/lib/logger";

export interface EnvWithBindings {
	DB?: unknown;
	VECTORIZE?: unknown;
	OPENAI_API_KEY?: string | unknown;
	[key: string]: unknown;
}

export interface EnvWithSecrets {
	[key: string]: unknown;
}

let ENV_VAR_CACHE_BY_ENV: WeakMap<object, Map<string, string>> = new WeakMap();
const ENV_VAR_GLOBAL_CACHE = new Map<string, string>();

function getCacheForEnv(env: EnvWithSecrets): Map<string, string> {
	if (env && typeof env === "object") {
		const existing = ENV_VAR_CACHE_BY_ENV.get(env as object);
		if (existing) return existing;
		const created = new Map<string, string>();
		ENV_VAR_CACHE_BY_ENV.set(env as object, created);
		return created;
	}

	return ENV_VAR_GLOBAL_CACHE;
}

// Exported for unit tests and local debugging, but not used by app code.
export function __resetEnvVarCacheForTests(): void {
	ENV_VAR_CACHE_BY_ENV = new WeakMap();
	ENV_VAR_GLOBAL_CACHE.clear();
}

/**
 * Get environment variable with priority order:
 * 1. .dev.vars file (process.env[varName])
 * 2. Environment binding (env[varName] as string)
 * 3. Cloudflare secrets store (env[varName].get())
 *
 * @param env - Environment object with potential secrets store bindings
 * @param varName - Name of the environment variable to retrieve
 * @param required - Whether to throw an error if the variable is not found (default: true)
 * @returns The environment variable value
 * @throws Error if required is true and no value is found
 */
export async function getEnvVar(
	env: EnvWithSecrets,
	varName: string,
	required: boolean = true
): Promise<string> {
	const cache = getCacheForEnv(env);
	const cached = cache.get(varName);
	if (cached !== undefined) return cached;

	const logger = createLogger(env as Record<string, unknown>, "[getEnvVar]");

	// First priority: .dev.vars file (local development)
	const devVarsValue = process.env[varName];
	if (devVarsValue) {
		logger.once(
			`getEnvVar:${varName}`,
			"debug",
			`Resolved ${varName} from .dev.vars`
		);
		return devVarsValue;
	}

	// Second priority: direct string from environment binding
	const envValue = env[varName];
	if (typeof envValue === "string") {
		cache.set(varName, envValue);
		logger.once(
			`getEnvVar:${varName}`,
			"debug",
			`Resolved ${varName} from environment binding`
		);
		return envValue;
	}

	// Third priority: Cloudflare secrets store
	if (
		envValue &&
		typeof envValue === "object" &&
		"get" in envValue &&
		typeof envValue.get === "function"
	) {
		try {
			const secret = await (envValue as { get(): Promise<string> }).get();
			cache.set(varName, secret);
			logger.once(
				`getEnvVar:${varName}`,
				"debug",
				`Resolved ${varName} from secrets store`
			);
			return secret;
		} catch (_error) {
			throw new SecretStoreAccessError(varName);
		}
	}

	// No value available
	if (required) {
		throw new EnvironmentVariableError(
			varName,
			`${varName} not configured in .dev.vars, environment binding, or secrets store`
		);
	}

	return "";
}

/**
 * Validate that all required dependencies for PlanningContextService are available.
 * Throws appropriate errors if any dependencies are missing.
 *
 * @param env - Environment object with DB, VECTORIZE, and OPENAI_API_KEY bindings
 * @throws DatabaseConnectionError if DB is not configured
 * @throws VectorizeIndexRequiredError if VECTORIZE is not configured
 * @throws LLMProviderAPIKeyError if OPENAI_API_KEY is not configured
 */
export function validatePlanningContextDependencies(
	env: EnvWithBindings
): void {
	if (!env.DB) {
		throw new DatabaseConnectionError("Database not configured");
	}
	if (!env.VECTORIZE) {
		throw new VectorizeIndexRequiredError("Vectorize index not configured");
	}
	const keyBinding = env.OPENAI_API_KEY;
	const hasKey =
		(typeof keyBinding === "string" && keyBinding.trim() !== "") ||
		(keyBinding &&
			typeof keyBinding === "object" &&
			"get" in keyBinding &&
			typeof (keyBinding as { get?: unknown }).get === "function");
	if (!hasKey) {
		throw new LLMProviderAPIKeyError("OpenAI API key not configured");
	}
}

/**
 * Validate PlanningContextService dependencies for use in tools.
 * Returns a ToolResult error if validation fails, otherwise returns null.
 *
 * @param env - Environment object with DB, VECTORIZE, and OPENAI_API_KEY bindings
 * @param toolCallId - Tool call ID for error response
 * @param contextMessage - Optional context message for error
 * @returns ToolResult error if validation fails, null if validation passes
 */
export function validatePlanningContextDependenciesForTool(
	env: EnvWithBindings,
	toolCallId: string,
	contextMessage?: string
): ToolResult | null {
	const toolError = (
		message: string,
		error: string,
		errorCode: number
	): ToolResult => ({
		toolCallId,
		result: {
			success: false,
			message,
			data: { error, errorCode },
		},
	});

	if (!env.DB) {
		return toolError(
			"Database not configured",
			contextMessage || "Planning context search requires database access",
			500
		);
	}
	if (!env.VECTORIZE) {
		return toolError(
			"Vectorize index not configured",
			contextMessage || "Planning context search requires vector index access",
			500
		);
	}
	const keyBinding = env.OPENAI_API_KEY;
	const hasKey =
		(typeof keyBinding === "string" && keyBinding.trim() !== "") ||
		(keyBinding &&
			typeof keyBinding === "object" &&
			"get" in keyBinding &&
			typeof (keyBinding as { get?: unknown }).get === "function");
	if (!hasKey) {
		return toolError(
			"OpenAI API key not configured",
			contextMessage || "Planning context search requires OpenAI API key",
			500
		);
	}
	return null;
}
