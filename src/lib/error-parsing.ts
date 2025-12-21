/**
 * Utility functions for parsing and formatting error responses
 * Handles HTML error pages (e.g., Cloudflare Worker errors) and extracts meaningful messages
 */

export interface ParsedError {
  message: string;
  isActionable: boolean;
  suggestion?: string;
}

/**
 * Parse error response text and extract a human-readable message
 * Handles HTML error pages, JSON errors, and plain text errors
 */
export function parseErrorResponse(
  errorText: string,
  statusCode?: number
): ParsedError {
  // Check if it's HTML (Cloudflare Worker error pages)
  if (errorText.trim().startsWith("<!DOCTYPE") || errorText.includes("<html")) {
    return parseHtmlError(errorText, statusCode);
  }

  // Try to parse as JSON
  try {
    const jsonError = JSON.parse(errorText);
    if (jsonError.error) {
      return {
        message: jsonError.error,
        isActionable: true,
        suggestion: jsonError.message || jsonError.suggestion,
      };
    }
    if (jsonError.message) {
      return {
        message: jsonError.message,
        isActionable: true,
        suggestion: jsonError.suggestion,
      };
    }
  } catch {
    // Not JSON, continue with text parsing
  }

  // Plain text error
  return {
    message:
      errorText.length > 200 ? `${errorText.substring(0, 200)}...` : errorText,
    isActionable: false,
  };
}

/**
 * Parse HTML error page (e.g., Cloudflare Worker error pages)
 * Extracts meaningful information from HTML error responses
 */
function parseHtmlError(html: string, statusCode?: number): ParsedError {
  // Check for memory limit errors
  if (
    html.includes("Worker exceeded resource limits") ||
    html.includes("Worker exceeded memory limit") ||
    html.includes("exceeded memory limit")
  ) {
    return {
      message: "The file is too large to process",
      isActionable: true,
      suggestion:
        "This file exceeds our 128MB limit. Please split the file into smaller parts (under 100MB each) or try again later. Large files are processed in chunks, which may take longer.",
    };
  }

  // Check for other Cloudflare Worker errors
  if (html.includes("Worker") && html.includes("error")) {
    // Check for timeout errors
    if (html.includes("timeout") || html.includes("Timeout")) {
      return {
        message: "The operation took too long to complete",
        isActionable: true,
        suggestion:
          "The file processing timed out. This can happen with very large files. Please try again later or split the file into smaller parts.",
      };
    }

    // Generic Cloudflare Worker error
    return {
      message: "A server error occurred while processing your request",
      isActionable: true,
      suggestion:
        "This may be a temporary issue. Please try again in a few moments. If the problem persists, the file may be too large - try splitting it into smaller parts.",
    };
  }

  // Check HTTP status code for common errors
  if (statusCode === 413) {
    return {
      message: "The file is too large to upload",
      isActionable: true,
      suggestion:
        "Please use a file smaller than 100MB. Large files should be split into smaller parts.",
    };
  }

  if (statusCode === 429) {
    return {
      message: "Too many requests - please wait a moment",
      isActionable: true,
      suggestion:
        "The server is handling many requests. Please wait a few seconds and try again.",
    };
  }

  if (statusCode === 503 || statusCode === 502) {
    return {
      message: "The server is temporarily unavailable",
      isActionable: true,
      suggestion:
        "This is likely a temporary issue. Please try again in a few moments.",
    };
  }

  // Generic HTML error - try to extract title
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1]
      .replace(/\s*\|\s*.*$/, "") // Remove domain suffix
      .trim();
    return {
      message: title || "An error occurred",
      isActionable: false,
    };
  }

  // Fallback for unrecognized HTML errors
  return {
    message: "An unexpected error occurred",
    isActionable: true,
    suggestion:
      "Please try again. If the problem persists, the file may be too large or there may be a temporary server issue.",
  };
}

/**
 * Format error for user notification
 * Combines error message and suggestion into a user-friendly string
 */
export function formatErrorForNotification(parsedError: ParsedError): string {
  if (parsedError.suggestion) {
    return `${parsedError.message}. ${parsedError.suggestion}`;
  }
  return parsedError.message;
}
