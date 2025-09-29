import { useCallback, useEffect, useState } from "react";
import { AuthService } from "../services/auth-service";
import { API_CONFIG } from "../shared-config";
import { JWT_STORAGE_KEY } from "../app-constants";

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

  // Check for stored OpenAI key
  const checkStoredOpenAIKey = useCallback(async (username: string) => {
    try {
      const response = await fetch(
        `/get-openai-key?username=${encodeURIComponent(username)}`
      );
      const result = (await response.json()) as {
        hasKey?: boolean;
        apiKey?: string;
      };
      if (response.ok && result.hasKey) {
        setStoredOpenAIKey(result.apiKey || "");
        setIsAuthenticated(true);
      } else {
        // No stored key found, show the auth modal immediately
        setIsAuthenticated(false);
        return false; // Indicate that auth modal should be shown
      }
    } catch (error) {
      console.error("Error checking stored OpenAI key:", error);
      // Show modal on error as well
      setIsAuthenticated(false);
      return false; // Indicate that auth modal should be shown
    }
    return true; // Authentication successful
  }, []);

  // Check authentication status on mount
  const checkAuthenticationStatus = useCallback(async () => {
    const payload = AuthService.getJwtPayload();
    if (payload?.username) {
      setUsername(payload.username);
      // Check if JWT is expired
      const jwt = getStoredJwt();
      if (jwt && AuthService.isJwtExpired(jwt)) {
        // JWT expired, show auth modal
        setIsAuthenticated(false);
        return false; // Indicate that auth modal should be shown
      } else {
        // JWT valid, check if we have stored OpenAI key
        return await checkStoredOpenAIKey(payload.username);
      }
    } else {
      // No JWT, show auth modal
      setIsAuthenticated(false);
      return false; // Indicate that auth modal should be shown
    }
  }, [checkStoredOpenAIKey, getStoredJwt]);

  // Handle authentication submission
  const handleAuthenticationSubmit = useCallback(
    async (username: string, adminKey: string, openaiApiKey: string) => {
      try {
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
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

        if (response.ok && result.token) {
          // Store JWT token
          AuthService.storeJwt(result.token);

          // Update stored OpenAI key
          setStoredOpenAIKey(openaiApiKey);

          // Set authentication state
          setIsAuthenticated(true);

          return true; // Authentication successful
        } else {
          throw new Error(result.error || "Authentication failed");
        }
      } catch (error) {
        console.error("Error during authentication:", error);
        throw error;
      }
    },
    []
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
    handleLogout,
  };
}
