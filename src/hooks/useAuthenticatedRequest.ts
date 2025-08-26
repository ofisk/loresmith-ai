import { useCallback } from "react";
import {
  AuthService,
  authenticatedFetchWithExpiration,
} from "../services/auth-service";

/**
 * Hook for making authenticated requests with automatic JWT expiration handling.
 *
 * This hook encapsulates the common pattern of:
 * - Making authenticated requests
 * - Handling JWT expiration
 * - Providing consistent error handling
 * - Managing authentication state
 *
 * @example
 * ```typescript
 * const { makeRequest, isAuthenticated } = useAuthenticatedRequest();
 *
 * const fetchData = async () => {
 *   const response = await makeRequest('/api/data');
 *   if (response.ok) {
 *     const data = await response.json();
 *     // Handle data
 *   }
 * };
 * ```
 */
export function useAuthenticatedRequest() {
  const makeRequest = useCallback(
    async (url: string, options?: RequestInit) => {
      const jwt = AuthService.getStoredJwt();
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        url,
        { ...options, jwt }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      return response;
    },
    []
  );

  const makeRequestWithData = useCallback(
    async <T>(url: string, options?: RequestInit): Promise<T> => {
      const response = await makeRequest(url, options);

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
    [makeRequest]
  );

  return {
    makeRequest,
    makeRequestWithData,
  };
}
