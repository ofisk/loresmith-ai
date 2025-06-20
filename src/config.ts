/**
 * Configuration for API endpoints
 * In development: uses VITE_API_URL from .dev.vars
 * In production: uses same origin (relative URLs)
 */
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || "",
  CHAT_ENDPOINT: `${import.meta.env.VITE_API_URL || ""}/api/chat`,
} as const;
