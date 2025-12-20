/**
 * Utility functions for environment variable access
 */

import {
  SecretStoreAccessError,
  EnvironmentVariableError,
  DatabaseConnectionError,
  VectorizeIndexRequiredError,
  OpenAIAPIKeyError,
} from "@/lib/errors";
import type { ToolResult } from "@/app-constants";
import { createToolError } from "@/tools/utils";

export interface EnvWithBindings {
  DB?: unknown;
  VECTORIZE?: unknown;
  OPENAI_API_KEY?: string | unknown;
  [key: string]: unknown;
}

export interface EnvWithSecrets {
  [key: string]: unknown;
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
  // First priority: .dev.vars file (local development)
  const devVarsValue = process.env[varName];
  console.log(`[getEnvVar] Checking ${varName}:`, {
    devVarsValue: devVarsValue ? "present" : "not present",
    envValue: env[varName] ? typeof env[varName] : "undefined",
    envValueKeys:
      env[varName] && typeof env[varName] === "object"
        ? Object.keys(env[varName])
        : "N/A",
  });

  if (devVarsValue) {
    console.log(`[getEnvVar] Using .dev.vars file for ${varName}`);
    return devVarsValue;
  }

  // Second priority: direct string from environment binding
  const envValue = env[varName];
  if (typeof envValue === "string") {
    console.log(`[getEnvVar] Using environment binding for ${varName}`);
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
      console.log(`[getEnvVar] Using Cloudflare secrets store for ${varName}`);
      return await (envValue as { get(): Promise<string> }).get();
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
 * @throws OpenAIAPIKeyError if OPENAI_API_KEY is not configured
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
  if (!env.OPENAI_API_KEY || typeof env.OPENAI_API_KEY !== "string") {
    throw new OpenAIAPIKeyError("OpenAI API key not configured");
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
  if (!env.DB) {
    return createToolError(
      "Database not configured",
      contextMessage || "Planning context search requires database access",
      500,
      toolCallId
    );
  }
  if (!env.VECTORIZE) {
    return createToolError(
      "Vectorize index not configured",
      contextMessage || "Planning context search requires vector index access",
      500,
      toolCallId
    );
  }
  if (!env.OPENAI_API_KEY || typeof env.OPENAI_API_KEY !== "string") {
    return createToolError(
      "OpenAI API key not configured",
      contextMessage || "Planning context search requires OpenAI API key",
      500,
      toolCallId
    );
  }
  return null;
}
