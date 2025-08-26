// Import all file tools
export * from "./list-tools";
export * from "./metadata-tools";

// Export the tools object for backward compatibility
import { deleteFile, getFileStats, listFiles } from "./list-tools";
import { autoGenerateFileMetadata, updateFileMetadata } from "./metadata-tools";

export const fileTools = {
  // List tools
  listFiles,
  getFileStats,
  deleteFile,

  // Metadata tools
  updateFileMetadata,
  autoGenerateFileMetadata,
} as const;
