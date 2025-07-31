import { ERROR_MESSAGES } from "../constants";
import { createAuthHeaders } from "../services/auth-service";

/**
 * Helper function for tools to create authenticated fetch requests
 * Automatically includes JWT from the tool's context
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit & { jwt?: string | null } = {}
): Promise<Response> {
  const { jwt, ...fetchOptions } = options;

  const headers = createAuthHeaders(jwt);

  // Merge with any existing headers
  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers);
  }

  return fetch(url, {
    ...fetchOptions,
    headers,
  });
}

/**
 * Helper function to handle authentication errors in tools
 */
export function handleAuthError(response: Response): string | null {
  if (response.status === 401) {
    return ERROR_MESSAGES.AUTHENTICATION_REQUIRED;
  }
  if (response.status === 403) {
    return ERROR_MESSAGES.ACCESS_DENIED;
  }
  return null;
}

/**
 * Helper function to create authenticated API request options for tools
 */
export function createToolAuthOptions(jwt?: string | null): {
  headers: Record<string, string>;
} {
  return {
    headers: createAuthHeaders(jwt),
  };
}
