import { useCallback, useEffect, useId, useState } from "react";
import { useJwtExpiration } from "@/hooks/useJwtExpiration";
import type { useModalState } from "@/hooks/useModalState";
import { useAppAuthentication } from "@/hooks/useAppAuthentication";
import { logger } from "@/lib/logger";

/**
 * Generate a unique session ID for this browser session
 * This will be used to create a unique Durable Object ID for each session
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get or create a session ID, persisting it in localStorage
 * This ensures the same session ID is used across browser sessions
 */
export function getSessionId(): string {
  const existingSessionId = localStorage.getItem("chat-session-id");
  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = generateSessionId();
  localStorage.setItem("chat-session-id", newSessionId);
  return newSessionId;
}

interface UseAppStateReturn {
  // UI state
  chatContainerId: string;
  showDebug: boolean;
  setShowDebug: (show: boolean | ((prev: boolean) => boolean)) => void;
  textareaHeight: string;
  setTextareaHeight: (height: string) => void;
  triggerFileUpload: boolean;
  setTriggerFileUpload: (trigger: boolean) => void;

  // Session
  sessionId: string;

  // Auth coordination
  initializeAuth: () => Promise<void>;
}

interface UseAppStateOptions {
  modalState?: ReturnType<typeof useModalState>;
}

/**
 * Consolidated app UI state hook that manages local UI state
 * and coordinates authentication initialization
 */
export function useAppState(
  options: UseAppStateOptions = {}
): UseAppStateReturn {
  const chatContainerId = useId();

  // Local UI state
  const [showDebug, setShowDebug] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState("40px"); // Compact initial height
  const [triggerFileUpload, setTriggerFileUpload] = useState(false);

  const { modalState } = options;
  const authState = useAppAuthentication();

  // Initialize authentication on mount
  const initializeAuth = useCallback(async () => {
    const log = logger.scope("[useAppState]");
    log.debug("Initializing authentication");
    const isAuthenticated = await authState.checkAuthenticationStatus();
    const shouldShowAuthModal = !isAuthenticated;
    log.debug("Auth check result", {
      isAuthenticated,
      shouldShowAuthModal,
      hasModalState: !!modalState,
    });
    if (shouldShowAuthModal && modalState) {
      log.info("Showing auth modal");
      modalState.setShowAuthModal(true);
    } else if (shouldShowAuthModal && !modalState) {
      log.warn("Should show auth modal but modalState not provided");
    } else {
      log.debug("User is authenticated, not showing modal");
    }
  }, [authState, modalState]);

  // Check authentication status on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Handle JWT expiration globally
  useJwtExpiration({
    onExpiration: () => {
      // JWT expired - show auth modal
      if (modalState) {
        modalState.setShowAuthModal(true);
      } else {
        logger
          .scope("[useAppState]")
          .warn("JWT expired but modalState not available");
      }
    },
  });

  // Get session ID for this browser session
  const sessionId = getSessionId();

  return {
    // UI state
    chatContainerId,
    showDebug,
    setShowDebug,
    textareaHeight,
    setTextareaHeight,
    triggerFileUpload,
    setTriggerFileUpload,

    // Session
    sessionId,

    // Auth coordination
    initializeAuth,
  };
}
