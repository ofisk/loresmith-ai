// Import all PDF tools

import { deletePdfFile, getPdfStats, listPdfFiles } from "./list-tools";
import { updatePdfMetadata } from "./metadata-tools";
import {
  completePdfUpload,
  generatePdfUploadUrl,
  processPdfUpload,
} from "./upload-tools";

export { deletePdfFile, getPdfStats, listPdfFiles } from "./list-tools";
export { updatePdfMetadata } from "./metadata-tools";
export {
  completePdfUpload,
  generatePdfUploadUrl,
  processPdfUpload,
} from "./upload-tools";

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
