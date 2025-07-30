import { useEffect, useState } from "react";
import { API_CONFIG } from "../constants";
import { createAuthHeadersFromStorage } from "../lib/auth";
import { useBaseAsync } from "./useBaseAsync";

interface UseOpenAIKeyReturn {
  hasApiKey: boolean;
  isLoading: boolean;
  error: string | null;
  setApiKey: (apiKey: string) => Promise<void>;
  checkApiKeyStatus: () => Promise<void>;
}

export function useOpenAIKey(): UseOpenAIKeyReturn {
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  const checkApiKeyStatus = useBaseAsync(
    async () => {
      // Get the session ID from localStorage to check the correct Chat Durable Object
      const sessionId = localStorage.getItem("chat-session-id") || "default";

      // Check if the user has an API key stored in their session
      const url = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.OPENAI.CHECK_USER_KEY
      );
      console.log("[useOpenAIKey] Checking API key status URL:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...createAuthHeadersFromStorage(),
          "X-Session-ID": sessionId, // Include session ID to check the correct Chat Durable Object
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        success: boolean;
        hasUserStoredKey?: boolean;
      };
      console.log("User OpenAI key check result:", result);

      // Check if the user has a stored API key
      return result.hasUserStoredKey === true;
    },
    {
      onSuccess: (hasKey) => setHasApiKey(hasKey),
      onError: () => setHasApiKey(false),
    }
  );

  const setApiKey = useBaseAsync(
    async (apiKey: string) => {
      // Get the session ID from localStorage to ensure we target the same Chat Durable Object
      const sessionId = localStorage.getItem("chat-session-id") || "default";

      // Store the API key in the user's session
      const url = API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHAT.SET_OPENAI_KEY);
      console.log("[useOpenAIKey] Setting API key URL:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...createAuthHeadersFromStorage(),
          "X-Session-ID": sessionId, // Include session ID to target the correct Chat Durable Object
        },
        body: JSON.stringify({
          openaiApiKey: apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to set API key");
      }

      return true;
    },
    {
      onSuccess: () => setHasApiKey(true),
      showToast: true,
      successMessage: "API key set successfully!",
      errorMessage: "Failed to set API key",
    }
  );

  useEffect(() => {
    checkApiKeyStatus.execute();
  }, [checkApiKeyStatus.execute]); // Only run once on mount

  return {
    hasApiKey,
    isLoading: checkApiKeyStatus.loading || setApiKey.loading,
    error: checkApiKeyStatus.error || setApiKey.error,
    setApiKey: async (apiKey: string) => {
      await setApiKey.execute(apiKey);
    },
    checkApiKeyStatus: async () => {
      await checkApiKeyStatus.execute();
    },
  };
}
