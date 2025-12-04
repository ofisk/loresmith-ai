// Core types for the upload and library system

export interface UploadSession {
  id: string;
  userId: string;
  fileKey: string;
  uploadId: string;
  filename: string;
  fileSize: number;
  totalParts: number;
  uploadedParts: number;
  status: "pending" | "uploading" | "completed" | "failed" | "processing";
  createdAt: string;
  updatedAt: string;
  metadata?: FileMetadata;
}

export interface FileMetadata {
  id: string;
  fileKey: string;
  userId: string;
  filename: string;
  displayName?: string; // Auto-generated pretty name
  fileSize: number;
  contentType: string;
  description?: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  vectorId?: string; // For RAG indexing
}

export interface UploadPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface UploadProgress {
  sessionId: string;
  uploadedParts: number;
  totalParts: number;
  percentage: number;
  status: UploadSession["status"];
}

export interface SearchResult {
  id: string;
  file_key: string;
  file_name: string;
  description?: string;
  tags: string[];
  file_size: number;
  created_at: string;
  status: string;
  score?: number; // For semantic search
}

export interface SearchQuery {
  query: string;
  userId: string;
  limit?: number;
  offset?: number;
  includeTags?: boolean;
  includeSemantic?: boolean;
}

export interface ChunkDefinition {
  chunkIndex: number;
  totalChunks: number;
  pageRangeStart?: number; // For PDFs: start page (1-based)
  pageRangeEnd?: number; // For PDFs: end page (1-based)
  byteRangeStart?: number; // For non-PDFs: start byte
  byteRangeEnd?: number; // For non-PDFs: end byte
}

export interface FileProcessingChunk {
  id: string;
  fileKey: string;
  username: string;
  chunkIndex: number;
  totalChunks: number;
  pageRangeStart?: number;
  pageRangeEnd?: number;
  byteRangeStart?: number;
  byteRangeEnd?: number;
  status: "pending" | "processing" | "completed" | "failed";
  vectorId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  processedAt?: string;
  updatedAt?: string;
}

export interface ChunkProcessingResult {
  chunkId: string;
  success: boolean;
  vectorId?: string;
  error?: string;
  text?: string;
  metadata?: {
    displayName?: string;
    description: string;
    tags: string[];
  };
}
