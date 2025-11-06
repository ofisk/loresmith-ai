import { useEffect, useRef, useState } from "react";
import { getStoredJwt, isJwtExpired } from "@/services/core/auth-service";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { logger } from "@/lib/logger";

/**
 * Custom hook that waits for authentication to be ready
 * Returns true when JWT token is available and valid (not expired), false otherwise
 * Continuously monitors for JWT changes (including after authentication)
 */
export function useAuthReady(): boolean {
  const [authReady, setAuthReady] = useState(false);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReadyRef = useRef(false);

  useEffect(() => {
    const checkAuth = (shouldLog: boolean = false) => {
      const log = logger.scope("[useAuthReady]");
      const jwt = getStoredJwt();
      if (!jwt) {
        if (shouldLog) {
          log.debug("No JWT found");
        }
        setAuthReady((prev) => {
          if (prev !== false) {
            if (shouldLog) {
              log.debug("Auth state changed: ready -> not ready");
            }
            isReadyRef.current = false;
            return false;
          }
          return false;
        });
        return false;
      }

      const expired = isJwtExpired(jwt);
      if (!expired) {
        const wasReady = isReadyRef.current;
        setAuthReady((prev) => {
          if (prev !== true) {
            if (shouldLog) {
              log.info("JWT is valid - auth ready");
            }
            isReadyRef.current = true;
            // If we just became ready, stop polling - events will handle future changes
            if (!wasReady && intervalIdRef.current) {
              clearInterval(intervalIdRef.current);
              intervalIdRef.current = null;
              log.debug("Auth ready - stopping polling interval");
            }
            return true;
          }
          return true;
        });
        return true;
      }

      // JWT exists but is expired
      if (shouldLog) {
        log.warn("JWT is expired or invalid");
      }
      setAuthReady((prev) => {
        if (prev !== false) {
          if (shouldLog) {
            log.debug("Auth state changed: ready -> not ready (expired)");
          }
          isReadyRef.current = false;
          return false;
        }
        return false;
      });
      return false;
    };

    // Check immediately and log the initial state
    const initialReady = checkAuth(true);

    // Only set up polling interval if auth is NOT ready
    // Once auth is ready, we rely on events (jwt-changed, storage) for updates
    if (!initialReady) {
      const log = logger.scope("[useAuthReady]");
      log.debug("Auth not ready - starting polling interval");
      intervalIdRef.current = setInterval(() => {
        // Check if we should still be polling (only if not ready)
        const jwt = getStoredJwt();
        if (!jwt || isJwtExpired(jwt)) {
          checkAuth(false); // Don't log on every interval check
        } else {
          // Auth became ready - checkAuth will clear the interval
          checkAuth(false);
        }
      }, 1000); // Increased to 1 second since we're only polling when waiting
    }

    // Listen for storage changes (when JWT is stored/updated)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === JWT_STORAGE_KEY) {
        // JWT was added, updated, or removed - re-check auth status
        checkAuth(true); // Log when storage changes
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also listen for custom event that might be dispatched when JWT changes
    const handleJwtChange = () => {
      checkAuth(true); // Log when JWT changes via event
    };

    window.addEventListener("jwt-changed", handleJwtChange as EventListener);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "jwt-changed",
        handleJwtChange as EventListener
      );
    };
  }, []); // Empty deps - only run once on mount

  return authReady;
}
