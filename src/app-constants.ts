/**
 * Centralized constants file for the Loresmith AI application
 * This file contains all shared constants used throughout the application
 */

// Re-export from shared-config.ts for convenience
export {
  API_CONFIG,
  APPROVAL,
  AUTH_CODES,
  type AuthResponse,
  type ToolResult,
} from "./shared-config";

// Application-specific constants
export const APP_CONFIG = {
  NAME: "Loresmith AI",
  VERSION: "1.0.0",
  DESCRIPTION: "AI-powered campaign management and planning tool",
} as const;

// File upload constants
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB max (Cloudflare Workers have 128MB memory limit, leaving buffer for overhead)
  // Currently only PDFs are supported. To add other file types:
  // 1. Update this array with MIME types (e.g., "application/msword", "text/plain")
  // 2. Add extraction logic in file-analysis-service.ts
  // 3. Update frontend file picker to accept new types
  ALLOWED_FILE_TYPES: ["application/pdf"],
  MAX_FILES_PER_USER: 100,
} as const;

// Library path constants - centralized for consistency across upload and search
export const LIBRARY_CONFIG = {
  // Always use "library" as the base path for file storage
  getBasePath: () => "library",
  // Generate library path for a specific user (without bucket name)
  getUserLibraryPath: (username: string) => `library/${username}`,
  // Generate full file path for a specific file in user's library (without bucket name)
  getFilePath: (username: string, filename: string) =>
    `library/${username}/${filename}`,
} as const;

// Campaign constants
export const CAMPAIGN_CONFIG = {
  MAX_CAMPAIGNS_PER_USER: 50,
  MAX_RESOURCES_PER_CAMPAIGN: 100,
  ALLOWED_RESOURCE_TYPES: ["pdf", "character", "note", "image"] as const,
} as const;

// Authentication constants
export const AUTH_CONFIG = {
  JWT_EXPIRY_HOURS: 24,
  SESSION_TIMEOUT_MINUTES: 60,
  MAX_LOGIN_ATTEMPTS: 5,
} as const;

// UI constants
export const UI_CONFIG = {
  DEBOUNCE_DELAY_MS: 300,

  LOADING_TIMEOUT_MS: 30000,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Network error occurred. Please check your connection.",
  AUTHENTICATION_FAILED:
    "Authentication failed. Please check your credentials.",
  AUTHENTICATION_REQUIRED: "Authentication required. Please log in.",
  ACCESS_DENIED:
    "Access denied. You don't have permission to perform this action.",
  FILE_TOO_LARGE: "File is too large. Maximum size is 100MB.",
  INVALID_FILE_TYPE: "Invalid file type.",
  CAMPAIGN_NOT_FOUND: "Campaign not found",
  RESOURCE_NOT_FOUND: "Resource not found.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  SERVER_ERROR: "Server error occurred. Please try again later.",
  INTERNAL_SERVER_ERROR: "Internal server error",
  CAMPAIGN_NAME_REQUIRED: "Campaign name is required",
  CAMPAIGN_ID_REQUIRED: "Campaign ID is required",
  RESOURCE_TYPE_REQUIRED: "Resource type is required",
  RESOURCE_ID_REQUIRED: "Resource ID is required",
  RESOURCE_NAME_REQUIRED: "Resource name is required",
  INVALID_RESOURCE_TYPE: "Invalid resource type",
  RESOURCE_NOT_FOUND_IN_CAMPAIGN: "Resource not found in campaign",
  CAMPAIGN_ID_AND_RESOURCE_ID_REQUIRED:
    "Campaign ID and resource ID are required",
} as const;

// User-facing messages
export const USER_MESSAGES = {
  // Authentication messages
  INVALID_ADMIN_SECRET:
    "Invalid admin secret. Please check your secret and try again.",
  ADMIN_SECRET_VALIDATED:
    "Admin key validated successfully! You now have access to file upload and parsing features.",
  SESSION_EXPIRED: "Your session has expired. Please re-authenticate.",

  // File upload messages
  FILE_RECEIVED: "File has been received and will be processed.",
  FILES_LIST: "Uploaded files:",
  NO_FILES:
    "No files have been uploaded yet. Upload files through the file upload interface.",
  FILE_STATS_TITLE: "File Upload Statistics for user:",
  UPLOAD_URL_GENERATED: "Upload URL generated successfully for",
  METADATA_UPDATED: "Metadata updated successfully for file",
  FILE_INGESTION_STARTED: "File ingestion started successfully for",

  // Campaign messages
  NO_CAMPAIGNS:
    "You don't currently have any campaigns. You can create a new campaign using the createCampaign tool.",
  CAMPAIGNS_FOUND: "Found campaign(s):",
  CAMPAIGN_CREATED: "Campaign created successfully with ID:",
  CAMPAIGN_DELETED: "Campaign deleted successfully.",
  CAMPAIGNS_DELETED: "Campaigns deleted successfully.",
  ALL_CAMPAIGNS_DELETED: "All campaigns deleted successfully.",
  SOME_CAMPAIGNS_NOT_DELETED: "Some campaigns could not be deleted:",
  CAMPAIGN_RESOURCES_FOUND: "Found resource(s) in campaign",
  NO_RESOURCES: "No resources found for this campaign.",
  RESOURCES_FOUND: "Found resource(s):",
  RESOURCE_ADDED: "Resource added successfully to campaign",
  CAMPAIGN_DETAILS: "Campaign details:",
  INDEXING_TRIGGERED: "Indexing triggered successfully",

  // Error messages for users
  FAILED_TO_RETRIEVE_FILES: "Failed to retrieve files",
  FAILED_TO_RETRIEVE_STATS: "Failed to retrieve file stats",
  FAILED_TO_GENERATE_URL: "Failed to generate upload URL",
  FAILED_TO_UPDATE_METADATA: "Failed to update metadata",
  FAILED_TO_TRIGGER_INGESTION: "Failed to trigger ingestion",
  FAILED_TO_FETCH_CAMPAIGNS: "Failed to fetch campaigns",
  FAILED_TO_CREATE_CAMPAIGN: "Failed to create campaign",
  FAILED_TO_FETCH_RESOURCES: "Failed to fetch campaign resources",
  FAILED_TO_ADD_RESOURCE: "Failed to add resource to campaign",
  FAILED_TO_FETCH_DETAILS: "Failed to fetch campaign details",
  FAILED_TO_DELETE_CAMPAIGN: "Failed to delete campaign",
  FAILED_TO_DELETE_CAMPAIGNS: "Failed to delete campaigns",

  // Hook error messages
  HOOK_FAILED_TO_FETCH_CAMPAIGNS: "Failed to fetch campaigns",
  HOOK_FAILED_TO_FETCH_CAMPAIGN: "Failed to fetch campaign",
  HOOK_FAILED_TO_CREATE_CAMPAIGN: "Failed to create campaign",
  HOOK_FAILED_TO_ADD_RESOURCE: "Failed to add resource",
  HOOK_FAILED_TO_REMOVE_RESOURCE: "Failed to remove resource",
  HOOK_FAILED_TO_FETCH_FILES: "Failed to fetch files",
  HOOK_FAILED_TO_FETCH_SESSION_DIGESTS: "Failed to fetch session digests",
  HOOK_FAILED_TO_FETCH_SESSION_DIGEST: "Failed to fetch session digest",
  HOOK_FAILED_TO_CREATE_SESSION_DIGEST: "Failed to create session digest",
  HOOK_FAILED_TO_UPDATE_SESSION_DIGEST: "Failed to update session digest",
  HOOK_FAILED_TO_DELETE_SESSION_DIGEST: "Failed to delete session digest",
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  FILE_UPLOADED: "File uploaded successfully.",
  CAMPAIGN_CREATED: "Campaign created successfully.",
  RESOURCE_ADDED: "Resource added to campaign successfully.",
  METADATA_UPDATED: "Metadata updated successfully.",
  AUTHENTICATION_SUCCESS: "Authentication successful.",
} as const;

// Validation patterns
export const VALIDATION_PATTERNS = {
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
  CAMPAIGN_NAME: /^[a-zA-Z0-9\s_-]{1,100}$/,
  FILE_NAME: /^[a-zA-Z0-9\s._-]{1,255}$/,
} as const;

// Model configuration - Change models here!
export const MODEL_CONFIG = {
  // OpenAI Models
  OPENAI: {
    // Primary model for chat and general tasks
    PRIMARY: "gpt-4o-mini",
    // Model for metadata generation and analysis
    ANALYSIS: "gpt-3.5-turbo",
    // Model for metadata analysis (checklist coverage, campaign readiness)
    METADATA_ANALYSIS: "gpt-4o-mini",
    // Model for session planning and script generation
    SESSION_PLANNING: "gpt-4o",
    // Model for embeddings (if using OpenAI embeddings)
    EMBEDDINGS: "text-embedding-3-small",
  },
  // Model parameters
  PARAMETERS: {
    // Default temperature for chat responses
    CHAT_TEMPERATURE: 0.7,
    // Default temperature for analysis tasks
    ANALYSIS_TEMPERATURE: 0.3,
    // Default temperature for metadata analysis
    METADATA_ANALYSIS_TEMPERATURE: 0.1,
    // Default temperature for session planning
    SESSION_PLANNING_TEMPERATURE: 0.7,
    // Maximum tokens for responses
    MAX_TOKENS: 4000,
    // Maximum tokens for metadata analysis
    METADATA_ANALYSIS_MAX_TOKENS: 2000,
    // Maximum tokens for session planning (longer scripts need more tokens)
    SESSION_PLANNING_MAX_TOKENS: 8000,
    // Top P for response generation
    TOP_P: 0.9,
  },
  // LLM Provider configuration
  PROVIDER: {
    // Default provider for LLM operations
    DEFAULT: "openai" as const,
  },
} as const;

// Default values
export const DEFAULTS = {
  CAMPAIGN_NAME: "Untitled Campaign",
  FILE_DESCRIPTION: "No description provided",
  TAGS: [] as string[],
} as const;

// JWT Storage
export const JWT_STORAGE_KEY = "loresmith-jwt";
