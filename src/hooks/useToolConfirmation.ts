/**
 * Tool Confirmation Hook
 *
 * Centralizes tool confirmation logic and state management.
 * This hook provides a clean interface for handling tool confirmations
 * throughout the application.
 */

import type { tools } from "@/tools";
import {
  getConfirmationMessage,
  getPdfPendingConfirmations,
  hasPdfToolsPendingConfirmation,
  isPdfRelatedConfirmation,
  isToolCallPendingConfirmation,
  requiresConfirmation,
} from "@/utils/pdf-tool-confirmation";
import type { Message } from "@ai-sdk/react";
import { useMemo } from "react";

export interface UseToolConfirmationReturn {
  pendingToolCallConfirmation: boolean;
  pendingConfirmations: Array<{
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }>;
  isToolPendingConfirmation: (toolCallId: string) => boolean;
  getConfirmationMessageForTool: (
    toolName: string,
    args: Record<string, unknown>
  ) => string;
  isPdfRelatedTool: (toolName: string) => boolean;
  hasPdfToolsPending: boolean;
}

/**
 * Hook for managing tool confirmation state and logic
 */
export function useToolConfirmation(
  messages: Message[]
): UseToolConfirmationReturn {
  // Check if any tools are pending confirmation
  const pendingToolCallConfirmation = useMemo(() => {
    return messages.some((m: Message) =>
      m.parts?.some(
        (part) =>
          part.type === "tool-invocation" &&
          part.toolInvocation.state === "call" &&
          requiresConfirmation(
            part.toolInvocation.toolName as keyof typeof tools
          )
      )
    );
  }, [messages]);

  // Get all pending confirmations
  const pendingConfirmations = useMemo(() => {
    return getPdfPendingConfirmations(messages);
  }, [messages]);

  // Check if PDF tools are pending confirmation
  const hasPdfToolsPending = useMemo(() => {
    return hasPdfToolsPendingConfirmation(messages);
  }, [messages]);

  // Check if a specific tool call is pending confirmation
  const isToolPendingConfirmation = (toolCallId: string): boolean => {
    return isToolCallPendingConfirmation(toolCallId, messages);
  };

  // Get confirmation message for a specific tool
  const getConfirmationMessageForTool = (
    toolName: string,
    args: Record<string, unknown>
  ): string => {
    return getConfirmationMessage(toolName, args);
  };

  // Check if a tool is PDF-related
  const isPdfRelatedTool = (toolName: string): boolean => {
    return isPdfRelatedConfirmation(toolName);
  };

  return {
    pendingToolCallConfirmation,
    pendingConfirmations,
    isToolPendingConfirmation,
    getConfirmationMessageForTool,
    isPdfRelatedTool,
    hasPdfToolsPending,
  };
}
