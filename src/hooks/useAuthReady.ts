import { useEffect, useState } from "react";
import { getStoredJwt } from "../services/auth-service";

/**
 * Custom hook that waits for authentication to be ready
 * Returns true when JWT token is available, false otherwise
 * Automatically retries until auth is ready or timeout is reached
 */
export function useAuthReady(timeoutMs: number = 5000): boolean {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const jwt = getStoredJwt();
      if (jwt) {
        setAuthReady(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkAuth()) {
      return;
    }

    // Set up interval to check for auth readiness
    const interval = setInterval(() => {
      if (checkAuth()) {
        clearInterval(interval);
      }
    }, 100);

    // Clean up interval after timeout
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, timeoutMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [timeoutMs]);

  return authReady;
}
