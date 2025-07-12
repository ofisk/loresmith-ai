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
  DESCRIPTION: "AI-powered campaign management and PDF processing tool",
} as const;

// File upload constants
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_FILE_TYPES: ["application/pdf"],
  MAX_FILES_PER_USER: 100,
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
  FILE_TOO_LARGE: "File is too large. Maximum size is 50MB.",
  INVALID_FILE_TYPE: "Invalid file type. Only PDF files are allowed.",
  CAMPAIGN_NOT_FOUND: "Campaign not found.",
  RESOURCE_NOT_FOUND: "Resource not found.",
  UNAUTHORIZED: "You are not authorized to perform this action.",
  SERVER_ERROR: "Server error occurred. Please try again later.",
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

// Default values
export const DEFAULTS = {
  CAMPAIGN_NAME: "Untitled Campaign",
  FILE_DESCRIPTION: "No description provided",
  TAGS: [] as string[],
} as const;
