// Approval string to be shared across frontend and backend
export const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied.",
} as const;

// PDF Upload Configuration Constants
export const PDF_CONFIG = {
  // Storage limits
  TOTAL_STORAGE_LIMIT_GB: 10,
  TOTAL_STORAGE_LIMIT_BYTES: 10 * 1024 * 1024 * 1024, // 10GB in bytes

  // File size limits
  MAX_FILE_SIZE_MB: 200,
  MAX_FILE_SIZE_BYTES: 200 * 1024 * 1024, // 200MB in bytes

  // Upload method selection
  PRESIGNED_URL_THRESHOLD_MB: 50, // Files larger than this use presigned URLs
  PRESIGNED_URL_THRESHOLD_BYTES: 50 * 1024 * 1024, // 50MB in bytes

  // Upload constraints
  MAX_FILES_DEFAULT: 10,
  PRESIGNED_URL_EXPIRY_HOURS: 1,

  // File validation
  ALLOWED_MIME_TYPE: "application/pdf",
  ALLOWED_EXTENSION: ".pdf",
} as const;
