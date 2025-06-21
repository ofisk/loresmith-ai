/**
 * PDF Tool Confirmation Logic Utilities
 *
 * Utilities for handling PDF tool confirmation logic, including checking
 * which tools need confirmation and processing confirmation responses.
 */

import type { tools } from "@/tools";
import type { Message } from "@ai-sdk/react";

// List of tools that require human confirmation
// NOTE: this should match the keys in the executions object in tools.ts
export const PDF_TOOLS_REQUIRING_CONFIRMATION: (keyof typeof tools)[] = [
  "deletePdfFile",
  // Add other PDF tools here if they need confirmation in the future
];

/**
 * Check if a tool requires confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  return PDF_TOOLS_REQUIRING_CONFIRMATION.includes(
    toolName as keyof typeof tools
  );
}

/**
 * Check if any PDF-related tools are pending confirmation
 */
export function hasPdfToolsPendingConfirmation(messages: Message[]): boolean {
  return messages.some((m) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        requiresConfirmation(part.toolInvocation.toolName)
    )
  );
}

/**
 * Get pending tool confirmations for PDF-related tools
 */
export function getPdfPendingConfirmations(messages: Message[]): Array<{
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}> {
  const pendingConfirmations: Array<{
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }> = [];

  for (const m of messages) {
    if (m.parts) {
      for (const part of m.parts) {
        if (
          part.type === "tool-invocation" &&
          part.toolInvocation.state === "call" &&
          requiresConfirmation(part.toolInvocation?.toolName)
        ) {
          pendingConfirmations.push({
            toolCallId: part.toolInvocation?.toolCallId,
            toolName: part.toolInvocation?.toolName,
            arguments: part.toolInvocation?.args as Record<string, unknown>,
          });
        }
      }
    }
  }

  return pendingConfirmations;
}

/**
 * Check if a specific tool call is pending confirmation
 */
export function isToolCallPendingConfirmation(
  toolCallId: string,
  messages: Message[]
): boolean {
  return messages.some((m) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.toolCallId === toolCallId &&
        part.toolInvocation.state === "call" &&
        requiresConfirmation(part.toolInvocation.toolName)
    )
  );
}

/**
 * Get confirmation message for a specific tool
 */
export function getConfirmationMessage(
  toolName: string,
  args: Record<string, unknown>
): string {
  switch (toolName) {
    case "deletePdfFile":
      return `Are you sure you want to delete the PDF file "${args.fileId}"? This action cannot be undone.`;
    default:
      return `The AI wants to execute the "${toolName}" tool. Allow this?`;
  }
}

/**
 * Check if a tool confirmation is related to PDF operations
 */
export function isPdfRelatedConfirmation(toolName: string): boolean {
  const pdfRelatedTools = [
    "deletePdfFile",
    "uploadPdfFile",
    "generatePdfUploadUrl",
    "confirmPdfUpload",
  ];
  return pdfRelatedTools.includes(toolName);
}
