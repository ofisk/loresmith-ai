/**
 * Centralized constants file for the Loresmith AI application
 * This file contains all shared constants used throughout the application
 */

// Re-export from shared.ts for convenience
export {
  API_CONFIG,
  APPROVAL,
  AUTH_CODES,
  type AuthResponse,
  type ToolResult,
} from "./shared";

// Application-specific constants
export const APP_CONFIG = {
  NAME: "Loresmith AI",
  VERSION: "1.0.0",
  DESCRIPTION: "AI-powered campaign management and planning tool",
} as const;

// File upload constants
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB for files
  ALLOWED_FILE_TYPES: ["application/pdf"], //TODO: add other file types
  MAX_FILES_PER_USER: 100,
} as const;

// File processing constants for large files
export const FILE_PROCESSING_CONFIG = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB limit
  INGEST_CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for processing (reduced from 10MB)
  MAX_TEXT_LENGTH: 5 * 1024 * 1024, // 5MB text limit
  TIMEOUT_SMALL_FILES: 60000, // 1 minute for files < 100MB
  TIMEOUT_LARGE_FILES: 120000, // 2 minutes for files >= 100MB
  LARGE_FILE_THRESHOLD: 100 * 1024 * 1024, // 100MB threshold
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks (optimal for AutoRAG processing)
  MAX_CONCURRENT_UPLOADS: 3, // 3 concurrent upload chunks
  UPLOAD_TIMEOUT_MS: 120000, // 120 second timeout per chunk
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
  TOAST_DURATION_MS: 5000,
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
  FILE_TOO_LARGE: "File is too large. Maximum size is 500MB.",
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
    "No files have been uploaded yet. Use the generateFileUploadUrl tool to upload your first file.",
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
    // Model for embeddings (if using OpenAI embeddings)
    EMBEDDINGS: "text-embedding-3-small",
  },
  // Model parameters
  PARAMETERS: {
    // Default temperature for chat responses
    CHAT_TEMPERATURE: 0.7,
    // Default temperature for analysis tasks
    ANALYSIS_TEMPERATURE: 0.3,
    // Maximum tokens for responses
    MAX_TOKENS: 4000,
    // Top P for response generation
    TOP_P: 0.9,
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
