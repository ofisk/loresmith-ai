// Import all PDF tools

import { listPdfFiles, deletePdfFile, getPdfStats } from "./list-tools";
import {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
} from "./upload-tools";
import { updatePdfMetadata } from "./metadata-tools";

export { listPdfFiles, deletePdfFile, getPdfStats } from "./list-tools";
export {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
} from "./upload-tools";
export { updatePdfMetadata } from "./metadata-tools";

// Export the tools object for backward compatibility
export const pdfTools = {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
  listPdfFiles,
  deletePdfFile,
  updatePdfMetadata,
  getPdfStats,
};
