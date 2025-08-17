import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFProcessingService } from "../../src/services/pdf-processing-service";
import type { FileMetadata } from "../../src/types/upload";

// Mock service factory
vi.mock("../../src/services/service-factory", () => ({
  getLibraryRagService: vi.fn(),
  getPDFProcessingService: vi.fn(),
  getMetadataService: vi.fn(),
  getErrorHandlingService: vi.fn(),
}));

// Mock environment
const mockEnv = {
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
  },
  FILE_BUCKET: {
    get: vi.fn(),
  },
  AI: {
    run: vi.fn(),
  },
  VECTORIZE: {
    insert: vi.fn(),
  },
} as any;

// Mock RAG service
const mockRagService = {
  processPdfFromR2: vi.fn(),
};

describe("PDFProcessingService", () => {
  let pdfProcessingService: PDFProcessingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    pdfProcessingService = new PDFProcessingService(mockEnv);

    // Setup default mocks
    const { getLibraryRagService } = await import(
      "../../src/services/service-factory"
    );
    vi.mocked(getLibraryRagService).mockReturnValue(mockRagService as any);
  });

  describe("processUploadedFile", () => {
    const mockFileMetadata: FileMetadata = {
      id: "file-123",
      fileKey: "testuser/123-test-file.pdf",
      userId: "testuser",
      filename: "test-file.pdf",
      fileSize: 1024,
      contentType: "application/pdf",
      description: "",
      tags: [],
      status: "uploaded",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should process file successfully", async () => {
      // Mock database response
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      // Mock RAG service response
      mockRagService.processPdfFromR2.mockResolvedValue({
        suggestedMetadata: {
          description: "A test PDF document",
          tags: ["test", "document", "pdf"],
        },
      });

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        description: "A test PDF document",
        tags: ["test", "document", "pdf"],
      });
      expect(result.vectorId).toBeUndefined();

      // Verify status updates
      expect(mockEnv.DB.run).toHaveBeenCalledWith();
      expect(mockRagService.processPdfFromR2).toHaveBeenCalledWith(
        "testuser/123-test-file.pdf",
        "testuser",
        mockEnv.FILE_BUCKET,
        mockFileMetadata
      );
    });

    it("should handle file metadata not found", async () => {
      mockEnv.DB.first.mockResolvedValue(null);

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("PDF processing failed");
    });

    it("should handle RAG service errors", async () => {
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      mockRagService.processPdfFromR2.mockRejectedValue(
        new Error("Unavailable content in PDF document")
      );

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unavailable content in PDF document");
      expect(result.errorDetails).toBe(
        "The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text."
      );
    });

    it("should handle timeout errors", async () => {
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      mockRagService.processPdfFromR2.mockRejectedValue(
        new Error("PDF processing timeout")
      );

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("PDF processing timeout");
      expect(result.errorDetails).toBe(
        "The PDF processing took too long and was cancelled."
      );
    });

    it("should handle storage errors", async () => {
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      mockRagService.processPdfFromR2.mockRejectedValue(
        new Error("File not found in R2")
      );

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("File not found in storage");
      expect(result.errorDetails).toBe(
        "The uploaded file could not be found in storage."
      );
    });

    it("should handle authentication errors", async () => {
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      mockRagService.processPdfFromR2.mockRejectedValue(
        new Error("No OpenAI API key")
      );

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("OpenAI API key required");
      expect(result.errorDetails).toBe(
        "PDF processing requires an OpenAI API key for text analysis."
      );
    });

    it("should process without status updates when disabled", async () => {
      mockEnv.DB.first.mockResolvedValue({
        id: "file-123",
        file_key: "testuser/123-test-file.pdf",
        username: "testuser",
        file_name: "test-file.pdf",
        file_size: 1024,
        description: "",
        tags: "[]",
        status: "uploaded",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      mockRagService.processPdfFromR2.mockResolvedValue({
        suggestedMetadata: {
          description: "A test PDF document",
          tags: ["test", "document", "pdf"],
        },
      });

      const result = await pdfProcessingService.processUploadedFile(
        "testuser/123-test-file.pdf",
        "testuser",
        { updateStatus: false }
      );

      expect(result.success).toBe(true);
      // Should not call status update methods
      expect(mockEnv.DB.run).not.toHaveBeenCalled();
    });
  });

  describe("updateProcessingStatus", () => {
    it("should update status successfully", async () => {
      await pdfProcessingService.updateProcessingStatus(
        "testuser/123-test-file.pdf",
        "processed"
      );

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        "UPDATE pdf_files SET status = ?, updated_at = ?, error_message = ? WHERE file_key = ?"
      );
      expect(mockEnv.DB.bind).toHaveBeenCalledWith(
        "processed",
        expect.any(String),
        null,
        "testuser/123-test-file.pdf"
      );
    });

    it("should update status with error message", async () => {
      await pdfProcessingService.updateProcessingStatus(
        "testuser/123-test-file.pdf",
        "error",
        "Test error message"
      );

      expect(mockEnv.DB.bind).toHaveBeenCalledWith(
        "error",
        expect.any(String),
        "Test error message",
        "testuser/123-test-file.pdf"
      );
    });

    it("should handle database errors gracefully", async () => {
      mockEnv.DB.run.mockRejectedValue(new Error("Database error"));

      // Should not throw
      await expect(
        pdfProcessingService.updateProcessingStatus(
          "testuser/123-test-file.pdf",
          "processed"
        )
      ).resolves.toBeUndefined();
    });
  });
});
