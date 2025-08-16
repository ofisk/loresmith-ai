/**
 * Utility functions for environment variable access
 */

export interface EnvWithSecrets {
  [key: string]: any;
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
  if (envValue && typeof envValue.get === "function") {
    try {
      console.log(`[getEnvVar] Using Cloudflare secrets store for ${varName}`);
      return await envValue.get();
    } catch (error) {
      throw new Error(`Failed to access ${varName} from secrets store`);
    }
  }

  // No value available
  if (required) {
    throw new Error(
      `${varName} not configured in .dev.vars, environment binding, or secrets store`
    );
  }

  return "";
}

/**
 * Get ADMIN_SECRET with priority order (backward compatibility)
 * @deprecated Use getEnvVar(env, 'ADMIN_SECRET') instead
 */
export async function getAdminSecret(env: EnvWithSecrets): Promise<string> {
  return getEnvVar(env, "ADMIN_SECRET");
}

/**
 * Example usage:
 *
 * // Get required environment variable (throws if not found)
 * const adminSecret = await getEnvVar(env, 'ADMIN_SECRET');
 *
 * // Get optional environment variable (returns empty string if not found)
 * const optionalVar = await getEnvVar(env, 'OPTIONAL_VAR', false);
 *
 * // Get any other environment variable
 * const apiKey = await getEnvVar(env, 'OPENAI_API_KEY');
 * const corsOrigins = await getEnvVar(env, 'CORS_ALLOWED_ORIGINS');
 */
