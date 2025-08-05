/**
 * PDF file schema and types for consistent data handling across the application
 */

export interface PdfFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description: string;
  tags: string; // JSON string
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PdfFileResponse {
  files: PdfFile[];
}

export interface PdfFileUpload {
  fileKey: string;
  fileName: string;
  fileSize: number;
  contentType?: string;
}

export interface PdfFileMetadata {
  fileKey: string;
  description?: string;
  tags?: string[];
}

// Helper functions for working with PDF files
export const pdfFileHelpers = {
  /**
   * Get file size in MB
   */
  getFileSizeMB: (fileSize: number): string => {
    return ((fileSize || 0) / 1024 / 1024).toFixed(2);
  },

  /**
   * Parse tags from JSON string
   */
  parseTags: (tags: string): string[] => {
    try {
      return JSON.parse(tags || "[]");
    } catch {
      return [];
    }
  },

  /**
   * Stringify tags to JSON string
   */
  stringifyTags: (tags: string[]): string => {
    return JSON.stringify(tags || []);
  },

  /**
   * Format file for display
   */
  formatFileForDisplay: (file: PdfFile): string => {
    const sizeMB = pdfFileHelpers.getFileSizeMB(file.file_size);
    return `${file.file_name} (${sizeMB} MB)`;
  },

  /**
   * Get file list for display
   */
  formatFileList: (files: PdfFile[]): string => {
    return files
      .map((file) => `- ${pdfFileHelpers.formatFileForDisplay(file)}`)
      .join("\n");
  },
};

// Database schema constants
export const PDF_SCHEMA = {
  TABLE_NAME: "pdf_files",
  COLUMNS: {
    ID: "id",
    FILE_KEY: "file_key",
    FILE_NAME: "file_name",
    FILE_SIZE: "file_size",
    DESCRIPTION: "description",
    TAGS: "tags",
    STATUS: "status",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
    USERNAME: "username",
  },
} as const;

// Status constants
export const PDF_STATUS = {
  UPLOADING: "uploading",
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  PROCESSED: "processed",
  ERROR: "error",
} as const;

export type PdfStatus = (typeof PDF_STATUS)[keyof typeof PDF_STATUS];
