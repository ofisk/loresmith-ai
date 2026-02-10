import { useCallback, useEffect, useState } from "react";
import { AuthService } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import {
  fetchOpenAIKeyOnce,
  clearOpenAIKeyCache,
} from "@/lib/openai-key-store";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { logger } from "@/lib/logger";

export function useAppAuthentication() {
  // Authentication state
  const [username, setUsername] = useState<string>("");
  const [storedOpenAIKey, setStoredOpenAIKey] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Get stored JWT for user operations
  const getStoredJwt = useCallback((): string | null => {
    return localStorage.getItem(JWT_STORAGE_KEY);
  }, []);

  // Check authentication status on mount
  const checkAuthenticationStatus = useCallback(async () => {
    const log = logger.scope("[useAppAuthentication]");
    log.debug("Checking authentication status");

    // Check localStorage directly to see what's actually stored
    const rawJwt =
      typeof window !== "undefined"
        ? localStorage.getItem(JWT_STORAGE_KEY)
        : null;
    log.debug("Raw JWT from localStorage", {
      exists: !!rawJwt,
      length: rawJwt?.length || 0,
      preview: rawJwt ? `${rawJwt.substring(0, 20)}...` : null,
    });

    const payload = AuthService.getJwtPayload();
    const jwt = getStoredJwt();

    log.debug("Auth check result", {
      hasPayload: !!payload,
      hasUsername: !!payload?.username,
      hasJwt: !!jwt,
      jwtLength: jwt?.length || 0,
      payloadKeys: payload ? Object.keys(payload) : null,
    });

    if (payload?.username) {
      setUsername(payload.username);
      // Check if JWT is expired
      if (jwt && AuthService.isJwtExpired(jwt)) {
        // JWT expired, show auth modal
        log.warn("JWT is expired - returning false");
        setIsAuthenticated(false);
        return false; // Indicate that auth modal should be shown
      } else if (!jwt) {
        // No JWT found
        log.warn("No JWT found - returning false");
        setIsAuthenticated(false);
        return false; // Indicate that auth modal should be shown
      } else {
        // JWT valid, user is authenticated
        log.debug("JWT is valid - user authenticated");
        setIsAuthenticated(true);
        // Try to get stored OpenAI key, but don't block authentication if it fails
        try {
          const result = await fetchOpenAIKeyOnce(payload.username);
          if (result.hasKey) {
            setStoredOpenAIKey(result.apiKey || "");
          }
        } catch (error) {
          log.error("Error checking stored OpenAI key", error);
          // Don't block authentication if we can't fetch the stored key
        }
        return true; // User is authenticated
      }
    } else {
      // No JWT payload, show auth modal
      log.warn("No JWT payload - returning false");
      setIsAuthenticated(false);
      return false; // Indicate that auth modal should be shown
    }
  }, [getStoredJwt]);

  // Handle authentication submission
  const handleAuthenticationSubmit = useCallback(
    async (username: string, adminKey: string, openaiApiKey: string) => {
      try {
        // Get session ID from localStorage to ensure we target the correct Chat Durable Object
        const sessionId =
          typeof window !== "undefined"
            ? localStorage.getItem("chat-session-id") || "default"
            : "default";

        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-ID": sessionId, // Include session ID to target the correct Chat Durable Object
            },
            body: JSON.stringify({
              username,
              adminSecret: adminKey?.trim() || undefined, // Make admin key optional
              openaiApiKey,
            }),
          }
        );

        const result = (await response.json()) as {
          success?: boolean;
          token?: string;
          error?: string;
        };

        const log = logger.scope("[useAppAuthentication]");
        log.debug("Auth response", {
          ok: response.ok,
          status: response.status,
          hasToken: !!result.token,
          error: result.error,
        });

        if (response.ok && result.token) {
          log.info("Storing JWT token");
          // Store JWT token
          AuthService.storeJwt(result.token);

          // Verify it was stored
          const stored = AuthService.getStoredJwt();
          log.debug("JWT stored, verification", {
            stored: !!stored,
            length: stored?.length || 0,
          });

          // Verify payload can be parsed
          const payload = AuthService.getJwtPayload();
          log.debug("JWT payload after storage", {
            hasPayload: !!payload,
            hasUsername: !!payload?.username,
            payloadKeys: payload ? Object.keys(payload) : null,
          });

          if (!payload || !payload.username) {
            log.error(
              "JWT stored but payload cannot be parsed or missing username",
              undefined,
              {
                stored: !!stored,
                payloadExists: !!payload,
              }
            );
            throw new Error(
              "Failed to parse authentication token. Please try again."
            );
          }

          // Ensure future key lookups are not blocked by stale cache
          clearOpenAIKeyCache();

          // Persist username immediately for UI
          setUsername(username);

          // Update stored OpenAI key
          setStoredOpenAIKey(openaiApiKey);

          // Set authentication state BEFORE re-checking to avoid race conditions
          setIsAuthenticated(true);

          // Re-check authentication status to ensure state is in sync
          // This also ensures useAuthReady and other hooks pick up the change
          await checkAuthenticationStatus();

          log.info("Authentication successful!");
          return true; // Authentication successful
        } else {
          const errorMsg =
            result.error || `Authentication failed (${response.status})`;
          log.error("Authentication failed", new Error(errorMsg));
          throw new Error(errorMsg);
        }
      } catch (error) {
        logger
          .scope("[useAppAuthentication]")
          .error("Error during authentication", error);
        throw error;
      }
    },
    [checkAuthenticationStatus]
  );

  const acceptToken = useCallback(
    async (token: string) => {
      AuthService.storeJwt(token);
      const payload = AuthService.getJwtPayload();
      if (payload?.username) {
        setUsername(payload.username);
      }
      clearOpenAIKeyCache();
      setIsAuthenticated(true);
      await checkAuthenticationStatus();
      return true;
    },
    [checkAuthenticationStatus]
  );

  const handleLogout = useCallback(async () => {
    try {
      // Call the logout endpoint
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.LOGOUT),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        // Clear local JWT storage
        AuthService.clearJwt();

        // Reset authentication state
        setIsAuthenticated(false);
        setUsername("");
        setShowUserMenu(false);

        return true; // Logout successful
      } else {
        throw new Error("Logout failed");
      }
    } catch (error) {
      console.error("Logout error:", error);
      console.error("Logout failed. Please try again.");

      // Force clear local state even if server call failed
      AuthService.clearJwt();
      setIsAuthenticated(false);
      setUsername("");
      setShowUserMenu(false);

      return false; // Logout failed
    }
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showUserMenu &&
        !(event.target as Element).closest(".user-menu-container")
      ) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  return {
    // State
    username,
    storedOpenAIKey,
    isAuthenticated,
    showUserMenu,
    setShowUserMenu,

    // Functions
    getStoredJwt,
    checkAuthenticationStatus,
    handleAuthenticationSubmit,
    acceptToken,
    handleLogout,
  };
}
