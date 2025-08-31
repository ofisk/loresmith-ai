import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../shared";
import { AuthService } from "../services/auth-service";
import { JWT_STORAGE_KEY } from "../constants";

interface AuthenticationState {
  showAuthModal: boolean;
  username: string;
  storedOpenAIKey: string;
  isAuthenticated: boolean;
  showUserMenu: boolean;
}

export function useAuthentication() {
  const [state, setState] = useState<AuthenticationState>({
    showAuthModal: false,
    username: "",
    storedOpenAIKey: "",
    isAuthenticated: false,
    showUserMenu: false,
  });

  // Update state with partial updates
  const updateState = useCallback((updates: Partial<AuthenticationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Get stored JWT for user operations
  const getStoredJwt = useCallback((): string | null => {
    return localStorage.getItem(JWT_STORAGE_KEY);
  }, []);

  // Check for stored OpenAI key
  const checkStoredOpenAIKey = useCallback(
    async (username: string) => {
      try {
        const response = await fetch(
          `/get-openai-key?username=${encodeURIComponent(username)}`
        );
        const result = (await response.json()) as {
          hasKey?: boolean;
          apiKey?: string;
        };
        if (response.ok && result.hasKey) {
          updateState({
            storedOpenAIKey: result.apiKey || "",
            isAuthenticated: true,
          });
        } else {
          // No stored key found, show the auth modal immediately
          console.log("[Auth] No stored OpenAI key found for user:", username);
          console.log("[Auth] Showing auth modal immediately");
          updateState({
            showAuthModal: true,
            isAuthenticated: false,
          });
        }
      } catch (error) {
        console.error("Error checking stored OpenAI key:", error);
        // Show modal on error as well
        console.log("[Auth] Error checking stored key, showing auth modal");
        updateState({
          showAuthModal: true,
          isAuthenticated: false,
        });
      }
    },
    [updateState]
  );

  // Handle authentication submission
  const handleAuthenticationSubmit = async (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => {
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
        updateState({
          storedOpenAIKey: openaiApiKey,
          isAuthenticated: true,
          showAuthModal: false,
        });
      } else {
        throw new Error(result.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Error during authentication:", error);
      throw error;
    }
  };

  // Handle logout
  const handleLogout = async () => {
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
        updateState({
          isAuthenticated: false,
          username: "",
          showUserMenu: false,
          showAuthModal: true,
        });

        // Show success message
        console.log("Logged out successfully");
      } else {
        throw new Error("Logout failed");
      }
    } catch (error) {
      console.error("Logout error:", error);
      console.error("Logout failed. Please try again.");

      // Force clear local state even if server call failed
      AuthService.clearJwt();
      updateState({
        isAuthenticated: false,
        username: "",
        showUserMenu: false,
        showAuthModal: true,
      });
    }
  };

  // Check authentication status on mount
  useEffect(() => {
    console.log("[Auth] useEffect running - checking authentication status");
    const payload = AuthService.getJwtPayload();
    if (payload?.username) {
      updateState({ username: payload.username });
      // Check if JWT is expired
      const jwt = getStoredJwt();
      if (jwt && AuthService.isJwtExpired(jwt)) {
        // JWT expired, show auth modal
        console.log("[Auth] JWT expired, showing auth modal");
        updateState({
          showAuthModal: true,
          isAuthenticated: false,
        });
      } else {
        // JWT valid, check if we have stored OpenAI key
        console.log("[Auth] JWT valid, checking stored OpenAI key");
        checkStoredOpenAIKey(payload.username);
      }
    } else {
      // No JWT, show auth modal
      console.log("[Auth] No JWT, showing auth modal");
      updateState({
        showAuthModal: true,
        isAuthenticated: false,
      });
    }
  }, [checkStoredOpenAIKey, getStoredJwt, updateState]);

  // Log authentication state changes for debugging
  useEffect(() => {
    console.log("[Auth] Authentication state changed:", state.isAuthenticated);
  }, [state.isAuthenticated]);

  return {
    // State
    ...state,

    // Actions
    handleAuthenticationSubmit,
    handleLogout,
    checkStoredOpenAIKey,
    getStoredJwt,

    // State setters
    setShowAuthModal: (show: boolean) => updateState({ showAuthModal: show }),
    setShowUserMenu: (show: boolean) => updateState({ showUserMenu: show }),
  };
}
