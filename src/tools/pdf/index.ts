// Import all PDF tools

import { deletePdfFile, getPdfStats, listPdfFiles } from "./list-tools";
import { autoGeneratePdfMetadata, updatePdfMetadata } from "./metadata-tools";
import {
  completePdfUpload,
  generatePdfUploadUrl,
  ingestPdfFile,
  processPdfUpload,
} from "./upload-tools";

export { deletePdfFile, getPdfStats, listPdfFiles } from "./list-tools";
export { autoGeneratePdfMetadata, updatePdfMetadata } from "./metadata-tools";
export {
  completePdfUpload,
  generatePdfUploadUrl,
  ingestPdfFile,
  processPdfUpload,
} from "./upload-tools";

// Export the tools object for backward compatibility
export const pdfTools = {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
  ingestPdfFile,
  listPdfFiles,
  deletePdfFile,
  updatePdfMetadata,
  autoGeneratePdfMetadata,
  getPdfStats,
};
