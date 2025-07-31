// Import all PDF tools

import { getPdfStats, listPdfFiles } from "./list-tools";
import { updatePdfMetadata, autoGeneratePdfMetadata } from "./metadata-tools";
import {
  generatePdfUploadUrl,
  ingestPdfFile,
  uploadPdfFile,
} from "./upload-tools";

export { getPdfStats, listPdfFiles } from "./list-tools";
export { updatePdfMetadata, autoGeneratePdfMetadata } from "./metadata-tools";
// Export all PDF tools
export {
  generatePdfUploadUrl,
  ingestPdfFile,
  uploadPdfFile,
} from "./upload-tools";

// Export the tools object for backward compatibility
export const pdfTools = {
  uploadPdfFile,
  ingestPdfFile,
  generatePdfUploadUrl,
  listPdfFiles,
  getPdfStats,
  updatePdfMetadata,
  autoGeneratePdfMetadata,
};
