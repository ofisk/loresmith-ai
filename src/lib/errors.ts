/**
 * Custom error classes for consistent error handling across the application.
 * Each error class has a standard message that is automatically set.
 */

// ============================================================================
// Authentication & Authorization Errors
// ============================================================================

export class OpenAIAPIKeyError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "OpenAI API key is required. Please provide an OpenAI API key to continue."
    );
    this.name = "OpenAIAPIKeyError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "Authentication required. Please log in to access this feature."
    );
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthenticationExpiredError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "Authentication expired. Please log in again to continue using the application."
    );
    this.name = "AuthenticationExpiredError";
  }
}

export class AuthenticationFailedError extends Error {
  constructor(message?: string) {
    super(message || "Authentication failed. Please check your credentials.");
    this.name = "AuthenticationFailedError";
  }
}

export class UserAuthenticationMissingError extends Error {
  constructor(message?: string) {
    super(
      message ||
        "User authentication missing from context. Please ensure you are logged in."
    );
    this.name = "UserAuthenticationMissingError";
  }
}

// ============================================================================
// File & Storage Errors
// ============================================================================

export class FileNotFoundError extends Error {
  constructor(fileKey?: string) {
    super(
      fileKey
        ? `File not found in R2: ${fileKey}`
        : "File not found in R2 storage."
    );
    this.name = "FileNotFoundError";
  }
}

export class SourceObjectNotFoundError extends Error {
  constructor(sourceKey: string) {
    super(`Source object not found: ${sourceKey}`);
    this.name = "SourceObjectNotFoundError";
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ResourceRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Resource is required for this operation.");
    this.name = "ResourceRequiredError";
  }
}

export class ResourceIdRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Resource ID is required for this operation.");
    this.name = "ResourceIdRequiredError";
  }
}

export class ResourceFileKeyRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Resource file_key is required for this operation.");
    this.name = "ResourceFileKeyRequiredError";
  }
}

export class ResourceFileNameRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Resource file_name is required for this operation.");
    this.name = "ResourceFileNameRequiredError";
  }
}

export class CampaignIdRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Campaign ID is required for this operation.");
    this.name = "CampaignIdRequiredError";
  }
}

export class CampaignNameRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Campaign name is required for this operation.");
    this.name = "CampaignNameRequiredError";
  }
}

export class UsernameRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Username is required for this operation.");
    this.name = "UsernameRequiredError";
  }
}

export class EnvironmentRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Environment is required for this operation.");
    this.name = "EnvironmentRequiredError";
  }
}

export class SearchPathValidationError extends Error {
  constructor(searchPath: string, reason?: string) {
    super(
      reason
        ? `Search path validation failed: ${reason} (path: "${searchPath}")`
        : `Search path validation failed for: "${searchPath}"`
    );
    this.name = "SearchPathValidationError";
  }
}

export class CampaignRagBasePathRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Campaign RAG base path is required for this operation.");
    this.name = "CampaignRagBasePathRequiredError";
  }
}

// ============================================================================
// Database & DAO Errors
// ============================================================================

export class DatabaseConnectionError extends Error {
  constructor(message?: string) {
    super(message || "Database connection is required for this operation.");
    this.name = "DatabaseConnectionError";
  }
}

export class DAOFactoryError extends Error {
  constructor(message?: string) {
    super(message || "Cannot create DAO factory with undefined database.");
    this.name = "DAOFactoryError";
  }
}

export class EntityNotFoundError extends Error {
  constructor(entityId?: string, campaignId?: string) {
    super(
      entityId && campaignId
        ? `Entity not found for campaign: ${entityId} in campaign ${campaignId}`
        : entityId
          ? `Entity not found: ${entityId}`
          : "Entity not found."
    );
    this.name = "EntityNotFoundError";
  }
}

export class RelationshipUpsertError extends Error {
  constructor(message?: string) {
    super(message || "Failed to upsert relationship.");
    this.name = "RelationshipUpsertError";
  }
}

export class SelfReferentialRelationshipError extends Error {
  constructor(message?: string) {
    super(message || "Self-referential relationships are not permitted.");
    this.name = "SelfReferentialRelationshipError";
  }
}

// ============================================================================
// Vectorize & Index Errors
// ============================================================================

export class VectorizeIndexRequiredError extends Error {
  constructor(message?: string) {
    super(message || "Vectorize index is required for this operation.");
    this.name = "VectorizeIndexRequiredError";
  }
}

export class InvalidEmbeddingResponseError extends Error {
  constructor(message?: string) {
    super(message || "Invalid embedding response format.");
    this.name = "InvalidEmbeddingResponseError";
  }
}

// ============================================================================
// Agent & Routing Errors
// ============================================================================

export class AgentNotRegisteredError extends Error {
  constructor(agentType: string) {
    super(`Agent type '${agentType}' is not registered.`);
    this.name = "AgentNotRegisteredError";
  }
}

// ============================================================================
// Processing & Service Errors
// ============================================================================

export class EntityExtractionError extends Error {
  constructor(message?: string) {
    super(message || "Failed to extract entities from content.");
    this.name = "EntityExtractionError";
  }
}

export class ImportanceCalculationError extends Error {
  constructor(
    message?: string,
    public readonly statusCode?: number
  ) {
    super(
      message ||
        "Failed to calculate or update entity importance. Please try again."
    );
    this.name = "ImportanceCalculationError";
  }
}

export class EmbeddingGenerationError extends Error {
  constructor(message?: string) {
    super(message || "Failed to generate embeddings.");
    this.name = "EmbeddingGenerationError";
  }
}

export class AIBindingError extends Error {
  constructor(message?: string) {
    super(message || "AI binding not available for this operation.");
    this.name = "AIBindingError";
  }
}

export class PDFExtractionError extends Error {
  constructor(message?: string) {
    super(message || "Failed to extract text from PDF.");
    this.name = "PDFExtractionError";
  }
}

export class MemoryLimitError extends Error {
  public readonly fileSizeMB: number;
  public readonly memoryLimitMB: number;
  public readonly fileKey?: string;
  public readonly fileName?: string;
  public readonly errorCode = "MEMORY_LIMIT_EXCEEDED";

  constructor(
    fileSizeMB: number,
    memoryLimitMB: number = 128,
    fileKey?: string,
    fileName?: string,
    message?: string
  ) {
    super(
      message ||
        `File "${fileName || "unknown"}" (${fileSizeMB.toFixed(2)}MB) is too large to process. Cloudflare Workers have a ${memoryLimitMB}MB memory limit and cannot load files this size. Please use a smaller file or split the document into smaller parts.`
    );
    this.name = "MemoryLimitError";
    this.fileSizeMB = fileSizeMB;
    this.memoryLimitMB = memoryLimitMB;
    this.fileKey = fileKey;
    this.fileName = fileName;
  }

  /**
   * Check if an error is a memory limit error using structured detection
   * Only checks for our structured MemoryLimitError type
   */
  static isMemoryLimitError(error: unknown): error is MemoryLimitError {
    return error instanceof MemoryLimitError;
  }

  /**
   * Convert runtime errors from external systems (Cloudflare Workers, pdfjs) to MemoryLimitError
   * This is a boundary conversion function that converts external errors to our structured error type
   * Only call this at the boundary where external errors enter our system
   */
  static fromRuntimeError(
    error: unknown,
    fileSizeMB: number,
    memoryLimitMB: number = 128,
    fileKey?: string,
    fileName?: string
  ): MemoryLimitError | null {
    // Check for our structured error first
    if (error instanceof MemoryLimitError) {
      return error;
    }

    // Boundary conversion: Convert runtime TypeError from Cloudflare Workers/pdfjs
    // Runtime errors come as TypeError with specific message pattern
    // We check error.name (TypeError) which is structured, not message content
    if (
      error instanceof TypeError &&
      error.message.includes("Memory limit would be exceeded")
    ) {
      return new MemoryLimitError(
        fileSizeMB,
        memoryLimitMB,
        fileKey,
        fileName,
        error.message
      );
    }

    return null;
  }
}

export class CampaignReadinessAnalysisError extends Error {
  constructor(message?: string) {
    super(message || "Failed to analyze campaign readiness.");
    this.name = "CampaignReadinessAnalysisError";
  }
}

export class ModuleExtractionError extends Error {
  constructor(message?: string) {
    super(message || "Failed to extract module information from PDF.");
    this.name = "ModuleExtractionError";
  }
}

export class RecommendationGenerationError extends Error {
  constructor(message?: string) {
    super(message || "Failed to generate recommendations.");
    this.name = "RecommendationGenerationError";
  }
}

export class CampaignDimensionAnalysisError extends Error {
  constructor(message?: string) {
    super(message || "Failed to analyze campaign dimension.");
    this.name = "CampaignDimensionAnalysisError";
  }
}

export class StorageUsageError extends Error {
  constructor(message?: string) {
    super(message || "Failed to get storage usage.");
    this.name = "StorageUsageError";
  }
}

export class UserStateAnalysisError extends Error {
  constructor(message?: string) {
    super(message || "Failed to analyze user state.");
    this.name = "UserStateAnalysisError";
  }
}

export class DataRetrievalError extends Error {
  constructor(message?: string) {
    super(message || "Failed to retrieve data.");
    this.name = "DataRetrievalError";
  }
}

// ============================================================================
// Environment & Configuration Errors
// ============================================================================

export class EnvironmentVariableError extends Error {
  constructor(varName: string, message?: string) {
    super(
      message ||
        `Failed to access ${varName} from environment or secrets store.`
    );
    this.name = "EnvironmentVariableError";
  }
}

export class SecretStoreAccessError extends Error {
  constructor(varName: string) {
    super(`Failed to access ${varName} from secrets store.`);
    this.name = "SecretStoreAccessError";
  }
}
