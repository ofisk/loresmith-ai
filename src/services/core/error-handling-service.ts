import {
  FileNotFoundError,
  PDFExtractionError,
  MemoryLimitError,
  OpenAIAPIKeyError,
} from "@/lib/errors";

export interface ErrorCategory {
  type:
    | "validation"
    | "processing"
    | "storage"
    | "authentication"
    | "network"
    | "unknown";
  message: string;
  details: string;
  retryable: boolean;
  userFriendly: boolean;
}

export interface ProcessingError {
  originalError: Error;
  category: ErrorCategory;
  context?: Record<string, any>;
}

export class ErrorHandlingService {
  /**
   * Categorize and format errors for consistent handling
   * Checks for structured error types first, then falls back to message pattern matching
   */
  categorizeError(
    error: Error,
    context?: Record<string, any>
  ): ProcessingError {
    // Check for structured error types first (preferred approach)
    if (error instanceof FileNotFoundError) {
      return {
        originalError: error,
        category: {
          type: "storage",
          message: "File not found in storage",
          details: "The uploaded file could not be found in storage.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (error instanceof PDFExtractionError) {
      return {
        originalError: error,
        category: {
          type: "processing",
          message: "PDF extraction failed",
          details:
            "The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (error instanceof MemoryLimitError) {
      return {
        originalError: error,
        category: {
          type: "processing",
          message: "File too large to process",
          details: error.message,
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (error instanceof OpenAIAPIKeyError) {
      return {
        originalError: error,
        category: {
          type: "authentication",
          message: "OpenAI API key required",
          details:
            "PDF processing requires an OpenAI API key for text analysis.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    // Fallback to message pattern matching for unknown errors
    const errorMessage = error.message.toLowerCase();

    // PDF Processing Errors
    if (errorMessage.includes("unavailable content in pdf document")) {
      return {
        originalError: error,
        category: {
          type: "processing",
          message: "Unavailable content in PDF document",
          details:
            "The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (errorMessage.includes("timeout")) {
      return {
        originalError: error,
        category: {
          type: "processing",
          message: "PDF processing timeout",
          details: "The PDF processing took too long and was cancelled.",
          retryable: true,
          userFriendly: true,
        },
        context,
      };
    }

    // Storage Errors
    if (
      errorMessage.includes("not found in r2") ||
      errorMessage.includes("file not found")
    ) {
      return {
        originalError: error,
        category: {
          type: "storage",
          message: "File not found in storage",
          details: "The uploaded file could not be found in storage.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (
      errorMessage.includes("access denied") ||
      errorMessage.includes("permission denied")
    ) {
      return {
        originalError: error,
        category: {
          type: "storage",
          message: "Storage access denied",
          details: "Unable to access storage due to permission restrictions.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    // Authentication Errors
    if (
      errorMessage.includes("no openai api key") ||
      errorMessage.includes("openai api key required")
    ) {
      return {
        originalError: error,
        category: {
          type: "authentication",
          message: "OpenAI API key required",
          details:
            "PDF processing requires an OpenAI API key for text analysis.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    if (
      errorMessage.includes("invalid token") ||
      errorMessage.includes("unauthorized")
    ) {
      return {
        originalError: error,
        category: {
          type: "authentication",
          message: "Authentication required",
          details: "Please log in to access this feature.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    // Network Errors
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("fetch")
    ) {
      return {
        originalError: error,
        category: {
          type: "network",
          message: "Network connection error",
          details:
            "Unable to connect to required services. Please check your internet connection.",
          retryable: true,
          userFriendly: true,
        },
        context,
      };
    }

    // Validation Errors
    if (
      errorMessage.includes("invalid") ||
      errorMessage.includes("validation")
    ) {
      return {
        originalError: error,
        category: {
          type: "validation",
          message: "Invalid input",
          details:
            "The provided data is not valid. Please check your input and try again.",
          retryable: false,
          userFriendly: true,
        },
        context,
      };
    }

    // Database Errors
    if (
      errorMessage.includes("database") ||
      errorMessage.includes("sql") ||
      errorMessage.includes("db")
    ) {
      return {
        originalError: error,
        category: {
          type: "storage",
          message: "Database error",
          details: "An error occurred while accessing the database.",
          retryable: true,
          userFriendly: false,
        },
        context,
      };
    }

    // AI Service Errors
    if (
      errorMessage.includes("ai") ||
      errorMessage.includes("openai") ||
      errorMessage.includes("model")
    ) {
      return {
        originalError: error,
        category: {
          type: "processing",
          message: "AI service error",
          details: "An error occurred while processing with AI services.",
          retryable: true,
          userFriendly: false,
        },
        context,
      };
    }

    // Default unknown error
    return {
      originalError: error,
      category: {
        type: "unknown",
        message: "An unexpected error occurred",
        details: errorMessage,
        retryable: false,
        userFriendly: false,
      },
      context,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error: Error): string {
    const processingError = this.categorizeError(error);
    return processingError.category.userFriendly
      ? processingError.category.message
      : "An unexpected error occurred";
  }

  /**
   * Get detailed error information for logging
   */
  getDetailedErrorInfo(
    error: Error,
    context?: Record<string, any>
  ): Record<string, any> {
    const processingError = this.categorizeError(error, context);

    return {
      originalMessage: error.message,
      originalStack: error.stack,
      category: processingError.category.type,
      retryable: processingError.category.retryable,
      userFriendly: processingError.category.userFriendly,
      context: processingError.context,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine if an error should trigger a retry
   */
  shouldRetry(error: Error): boolean {
    const processingError = this.categorizeError(error);
    return processingError.category.retryable;
  }

  /**
   * Get retry delay based on error type and attempt count
   */
  getRetryDelay(error: Error, attemptCount: number): number {
    const processingError = this.categorizeError(error);

    if (!processingError.category.retryable) {
      return 0;
    }

    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * 2 ** (attemptCount - 1), maxDelay);
    const jitter = Math.random() * 0.1 * delay; // 10% jitter

    return delay + jitter;
  }

  /**
   * Format error for API response
   */
  formatErrorForResponse(error: Error): { error: string; details?: string } {
    const processingError = this.categorizeError(error);

    return {
      error: processingError.category.message,
      details: processingError.category.userFriendly
        ? processingError.category.details
        : undefined,
    };
  }
}
