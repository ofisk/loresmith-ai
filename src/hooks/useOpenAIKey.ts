import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../constants";

interface UseOpenAIKeyReturn {
  hasApiKey: boolean;
  isLoading: boolean;
  error: string | null;
  setApiKey: (apiKey: string) => Promise<void>;
  checkApiKeyStatus: () => Promise<void>;
}

export function useOpenAIKey(): UseOpenAIKeyReturn {
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkApiKeyStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get the session ID from localStorage to check the correct Chat Durable Object
      const sessionId = localStorage.getItem("chat-session-id") || "default";

      // Check if the user has an API key stored in their session
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_USER_KEY),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": sessionId, // Include session ID to check the correct Chat Durable Object
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        success: boolean;
        hasUserStoredKey?: boolean;
      };
      console.log("User OpenAI key check result:", result);

      // Check if the user has a stored API key
      setHasApiKey(result.hasUserStoredKey === true);
    } catch (err) {
      console.error("Error checking user OpenAI key status:", err);
      // If we can't check, assume no API key
      setHasApiKey(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setApiKey = async (apiKey: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Get the session ID from localStorage to ensure we target the same Chat Durable Object
      const sessionId = localStorage.getItem("chat-session-id") || "default";

      // Store the API key in the user's session
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHAT.SET_OPENAI_KEY),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": sessionId, // Include session ID to target the correct Chat Durable Object
          },
          body: JSON.stringify({
            openaiApiKey: apiKey,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to set API key");
      }

      setHasApiKey(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set API key");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkApiKeyStatus();
  }, [checkApiKeyStatus]);

  return {
    hasApiKey,
    isLoading,
    error,
    setApiKey,
    checkApiKeyStatus,
  };
}
