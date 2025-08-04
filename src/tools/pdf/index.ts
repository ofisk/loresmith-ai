// Import all PDF tools

import { listPdfFiles } from "./list-tools";
import {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
} from "./upload-tools";

export { listPdfFiles } from "./list-tools";
export {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
} from "./upload-tools";

// Export the tools object for backward compatibility
export const pdfTools = {
  generatePdfUploadUrl,
  completePdfUpload,
  processPdfUpload,
  listPdfFiles,
};
