import { useCallback, useEffect, useState } from "react";
import { AuthService } from "@/services/auth-service";
import { JWT_STORAGE_KEY } from "@/constants";
import { API_CONFIG } from "@/shared";

export interface AuthContextType {
  isAuthenticated: boolean;
  username: string;
  storedOpenAIKey: string;
  showAuthModal: boolean;
  showUserMenu: boolean;
  setShowAuthModal: (show: boolean) => void;
  setShowUserMenu: (show: boolean) => void;
  handleAuthenticationSubmit: (
    username: string,
    adminKey: string,
    openaiApiKey: string
  ) => Promise<void>;
  handleLogout: () => Promise<void>;
  checkStoredOpenAIKey: (username: string) => Promise<void>;
  getStoredJwt: () => string | null;
}

export function useAuth(): AuthContextType {
  const [showAuthModal, setShowAuthModal] = useState(false);
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
        console.log("[Auth] No stored OpenAI key found for user:", username);
        console.log("[Auth] Showing auth modal immediately");
        setShowAuthModal(true);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Error checking stored OpenAI key:", error);
      // Show modal on error as well
      console.log("[Auth] Error checking stored key, showing auth modal");
      setShowAuthModal(true);
      setIsAuthenticated(false);
    }
  }, []);

  // Log authentication state changes for debugging
  useEffect(() => {
    console.log("[Auth] Authentication state changed:", isAuthenticated);
  }, [isAuthenticated]);

  // Check authentication status on mount
  useEffect(() => {
    console.log("[Auth] useEffect running - checking authentication status");
    const payload = AuthService.getJwtPayload();
    if (payload?.username) {
      setUsername(payload.username);
      // Check if JWT is expired
      const jwt = getStoredJwt();
      if (jwt && AuthService.isJwtExpired(jwt)) {
        // JWT expired, show auth modal
        console.log("[Auth] JWT expired, showing auth modal");
        setShowAuthModal(true);
        setIsAuthenticated(false);
      } else {
        // JWT valid, check if we have stored OpenAI key
        console.log("[Auth] JWT valid, checking stored OpenAI key");
        checkStoredOpenAIKey(payload.username);
      }
    } else {
      // No JWT, show auth modal
      console.log("[Auth] No JWT, showing auth modal");
      setShowAuthModal(true);
      setIsAuthenticated(false);
    }
  }, [checkStoredOpenAIKey, getStoredJwt]);

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
        setStoredOpenAIKey(openaiApiKey);

        // Set authentication state
        setIsAuthenticated(true);

        // Close modal
        setShowAuthModal(false);
      } else {
        throw new Error(result.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Error during authentication:", error);
      throw error;
    }
  };

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
        setIsAuthenticated(false);
        setUsername("");
        setShowUserMenu(false);

        // Show success message
        console.log("Logged out successfully");

        // Optionally show auth modal again
        setShowAuthModal(true);
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
      setShowAuthModal(true);
    }
  };

  return {
    isAuthenticated,
    username,
    storedOpenAIKey,
    showAuthModal,
    showUserMenu,
    setShowAuthModal,
    setShowUserMenu,
    handleAuthenticationSubmit,
    handleLogout,
    checkStoredOpenAIKey,
    getStoredJwt,
  };
}
