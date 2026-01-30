/**
 * File DAO layer: library file metadata (FileDAO) and chunk pipeline state
 * (FileProcessingChunksDAO). FileDAO is the public API; FileProcessingChunksDAO
 * is used only by FileDAO for the file_processing_chunks table.
 */
export type {
  FileMetadata,
  FileWithChunks,
  ParsedFileMetadata,
  PDFChunk,
} from "./file-dao";
export { FileDAO } from "./file-dao";
export { FileProcessingChunksDAO } from "./file-processing-chunks-dao";
