// Import all PDF tools
export * from "./list-tools";
export * from "./metadata-tools";
export * from "./upload-tools";

// Export the tools object for backward compatibility
import { listPdfFiles, getPdfStats, deletePdfFile } from "./list-tools";
import { updatePdfMetadata, autoGeneratePdfMetadata } from "./metadata-tools";
import {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfFile,
} from "./upload-tools";

export const pdfTools = {
  // List tools
  listPdfFiles,
  getPdfStats,
  deletePdfFile,

  // Metadata tools
  updatePdfMetadata,
  autoGeneratePdfMetadata,

  // Upload tools
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfFile,
} as const;
