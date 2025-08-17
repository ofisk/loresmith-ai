// Import all file tools
export * from "./list-tools";
export * from "./metadata-tools";
export * from "./upload-tools";

// Export the tools object for backward compatibility
import { listFiles, getFileStats, deleteFile } from "./list-tools";
import { updateFileMetadata, autoGenerateFileMetadata } from "./metadata-tools";
import {
  generateFileUploadUrl,
  completeFileUpload,
  processFile,
} from "./upload-tools";

export const fileTools = {
  // List tools
  listFiles,
  getFileStats,
  deleteFile,

  // Metadata tools
  updateFileMetadata,
  autoGenerateFileMetadata,

  // Upload tools
  generateFileUploadUrl,
  completeFileUpload,
  processFile,
} as const;
