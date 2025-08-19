import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryRAGService } from "../../src/services/rag-service";
import type { FileMetadata, SearchQuery } from "../../src/types/upload";

// Mock DAO factory
vi.mock("../../src/dao/dao-factory", () => ({
  getDAOFactory: vi.fn(),
}));

import { getDAOFactory } from "../../src/dao/dao-factory";

// Mock AI service
const mockAI = {
  run: vi.fn(),
};

// Mock environment
const mockEnv = {
  FILE_BUCKET: {
    get: vi.fn(),
  },
  AI: mockAI,
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  },
} as any;

describe("LibraryRAGService", () => {
  let ragService: LibraryRAGService;
  let mockFileDAO: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock DAO factory
    mockFileDAO = {
      getFilesForRag: vi.fn(),
      getFileForRag: vi.fn(),
      updateFileMetadataForRag: vi.fn(),
      updateFileRecord: vi.fn(),
    };

    (getDAOFactory as any).mockReturnValue({
      fileDAO: mockFileDAO,
    });

    ragService = new LibraryRAGService(mockEnv);
  });

  describe("processFile", () => {
    const mockFileMetadata: FileMetadata = {
      id: "file-123",
      fileKey: "uploads/test-file.pdf",
      userId: "user-123",
      filename: "test-file.pdf",
      fileSize: 1024,
      contentType: "application/pdf",
      description: "",
      tags: [],
      status: "uploaded",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should process PDF file successfully with AutoRAG", async () => {
      // Mock file retrieval
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);

      // Mock AI response
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: A test PDF document\nTAGS: [test, document, pdf]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile(mockFileMetadata);

      expect(result.description).toBe("A test PDF document");
      expect(result.tags).toEqual(["test", "document", "pdf"]);
      expect(result.vectorId).toMatch(/vector_file-123(_\d+)?(_fallback)?/);
      expect(mockEnv.FILE_BUCKET.get).toHaveBeenCalledWith(
        "uploads/test-file.pdf"
      );
      expect(mockAI.run).toHaveBeenCalledWith(
        expect.stringContaining("test-file.pdf")
      );
    });

    it("should handle file not found in R2", async () => {
      mockEnv.FILE_BUCKET.get.mockResolvedValue(null);

      const result = await ragService.processFile(mockFileMetadata);

      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
      expect(result.vectorId).toBeUndefined();
    });

    it("should handle AutoRAG processing failure gracefully", async () => {
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);

      // Mock AI failure
      mockAI.run.mockRejectedValue(new Error("AI error"));

      const result = await ragService.processFile(mockFileMetadata);

      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
      expect(result.vectorId).toMatch(/vector_file-123(_\d+)?(_fallback)?/);
    });

    it("should work without AI service available", async () => {
      const envWithoutAI = { ...mockEnv, AI: undefined };
      const ragServiceWithoutAI = new LibraryRAGService(envWithoutAI);

      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);

      const result = await ragServiceWithoutAI.processFile(mockFileMetadata);

      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
      expect(result.vectorId).toMatch(/vector_file-123(_\d+)?(_fallback)?/);
    });

    it("should handle processing errors gracefully", async () => {
      mockEnv.FILE_BUCKET.get.mockRejectedValue(new Error("R2 error"));

      const result = await ragService.processFile(mockFileMetadata);

      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
      expect(result.vectorId).toBeUndefined();
    });
  });

  describe("searchFiles", () => {
    const mockSearchQuery: SearchQuery = {
      query: "test document",
      userId: "user-123",
      limit: 10,
      offset: 0,
      includeTags: true,
      includeSemantic: true,
    };

    it("should search files successfully", async () => {
      const mockResults = [
        {
          id: "file-1",
          file_key: "uploads/file1.pdf",
          file_name: "file1.pdf",
          description: "Test document 1",
          tags: '["test", "document"]',
          file_size: 1024,
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "file-2",
          file_key: "uploads/file2.pdf",
          file_name: "file2.pdf",
          description: "Test document 2",
          tags: '["test", "pdf"]',
          file_size: 2048,
          created_at: "2024-01-02T00:00:00Z",
        },
      ];

      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: "file-1",
        file_key: "uploads/file1.pdf",
        file_name: "file1.pdf",
        description: "Test document 1",
        tags: ["test", "document"],
        file_size: 1024,
        created_at: "2024-01-01T00:00:00Z",
      });

      // Verify DAO calls
      expect(mockFileDAO.getFilesForRag).toHaveBeenCalledWith("user-123");
    });

    it("should search without query text", async () => {
      const queryWithoutText: SearchQuery = {
        ...mockSearchQuery,
        query: "",
      };

      const mockResults: any[] = [];
      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(queryWithoutText);

      expect(results).toHaveLength(0);
      expect(mockFileDAO.getFilesForRag).toHaveBeenCalledWith("user-123");
    });

    it("should handle search errors gracefully", async () => {
      mockFileDAO.getFilesForRag.mockRejectedValue(new Error("Database error"));

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results).toEqual([]);
    });

    it("should handle empty search results", async () => {
      const mockResults: any[] = [];
      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results).toEqual([]);
    });

    it("should handle null search results", async () => {
      const mockResults = null;
      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results).toEqual([]);
    });

    it("should parse tags correctly", async () => {
      const mockResults = [
        {
          id: "file-1",
          file_key: "uploads/file1.pdf",
          file_name: "file1.pdf",
          description: "Test document",
          tags: '["tag1", "tag2"]',
          file_size: 1024,
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results[0].tags).toEqual(["tag1", "tag2"]);
    });

    it("should handle empty tags", async () => {
      const mockResults = [
        {
          id: "file-1",
          file_key: "uploads/file1.pdf",
          file_name: "file1.pdf",
          description: "Test document",
          tags: null,
          file_size: 1024,
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFileDAO.getFilesForRag.mockResolvedValue(mockResults);

      const results = await ragService.searchFiles(mockSearchQuery);

      expect(results[0].tags).toEqual([]);
    });
  });

  describe("getFileMetadata", () => {
    it("should retrieve file metadata successfully", async () => {
      const mockResult = {
        id: "file-123",
        file_key: "uploads/test.pdf",
        username: "user-123",
        file_name: "test.pdf",
        file_size: 1024,
        content_type: "application/pdf",
        description: "Test PDF",
        tags: '["test", "pdf"]',
        status: "completed",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        vector_id: "vector_123",
      };

      mockFileDAO.getFileForRag.mockResolvedValue(mockResult);

      const metadata = await ragService.getFileMetadata("file-123", "user-123");

      expect(metadata).toEqual({
        id: "file-123",
        fileKey: "uploads/test.pdf",
        userId: "user-123",
        filename: "test.pdf",
        fileSize: 1024,
        contentType: "application/pdf",
        description: "Test PDF",
        tags: ["test", "pdf"],
        status: "completed",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        vectorId: undefined,
      });

      expect(mockFileDAO.getFileForRag).toHaveBeenCalledWith(
        "file-123",
        "user-123"
      );
    });

    it("should return null for non-existent file", async () => {
      mockFileDAO.getFileForRag.mockResolvedValue(null);

      const metadata = await ragService.getFileMetadata("file-123", "user-123");

      expect(metadata).toBeNull();
    });

    it("should handle database errors gracefully", async () => {
      mockFileDAO.getFileForRag.mockRejectedValue(new Error("Database error"));

      const metadata = await ragService.getFileMetadata("file-123", "user-123");

      expect(metadata).toBeNull();
    });
  });

  describe("updateFileMetadata", () => {
    it("should update file metadata successfully", async () => {
      const updates = {
        description: "Updated description",
        tags: ["updated", "tags"],
        status: "completed" as const,
      };

      mockFileDAO.getFileForRag.mockResolvedValue({
        file_key: "uploads/test.pdf",
        description: "Old description",
        tags: '["old", "tags"]',
      });
      mockFileDAO.updateFileMetadataForRag.mockResolvedValue(undefined);
      mockFileDAO.updateFileRecord.mockResolvedValue(undefined);

      const result = await ragService.updateFileMetadata(
        "file-123",
        "user-123",
        updates
      );

      expect(result).toBe(true);
      expect(mockFileDAO.getFileForRag).toHaveBeenCalledWith(
        "file-123",
        "user-123"
      );
      expect(mockFileDAO.updateFileMetadataForRag).toHaveBeenCalledWith(
        "uploads/test.pdf",
        "user-123",
        "Updated description",
        '["updated","tags"]'
      );
      expect(mockFileDAO.updateFileRecord).toHaveBeenCalledWith(
        "uploads/test.pdf",
        "completed"
      );
    });

    it("should handle no updates gracefully", async () => {
      mockFileDAO.getFileForRag.mockResolvedValue({
        file_key: "uploads/test.pdf",
        description: "Old description",
        tags: '["old", "tags"]',
      });

      const result = await ragService.updateFileMetadata(
        "file-123",
        "user-123",
        {}
      );

      expect(result).toBe(true);
      expect(mockFileDAO.getFileForRag).toHaveBeenCalledWith(
        "file-123",
        "user-123"
      );
    });

    it("should handle partial updates", async () => {
      const updates = {
        description: "Only description update",
      };

      mockFileDAO.getFileForRag.mockResolvedValue({
        file_key: "uploads/test.pdf",
        description: "Old description",
        tags: '["old", "tags"]',
      });
      mockFileDAO.updateFileMetadataForRag.mockResolvedValue(undefined);

      const result = await ragService.updateFileMetadata(
        "file-123",
        "user-123",
        updates
      );

      expect(result).toBe(true);
      expect(mockFileDAO.updateFileMetadataForRag).toHaveBeenCalledWith(
        "uploads/test.pdf",
        "user-123",
        "Only description update",
        '["old", "tags"]'
      );
    });

    it("should handle database errors gracefully", async () => {
      const updates = {
        description: "Updated description",
      };

      mockFileDAO.getFileForRag.mockRejectedValue(new Error("Database error"));

      const result = await ragService.updateFileMetadata(
        "file-123",
        "user-123",
        updates
      );

      expect(result).toBe(false);
    });

    it("should always include updated_at timestamp", async () => {
      const updates = {
        description: "Updated description",
      };

      mockFileDAO.getFileForRag.mockResolvedValue({
        file_key: "uploads/test.pdf",
        description: "Old description",
        tags: '["old", "tags"]',
      });
      mockFileDAO.updateFileMetadataForRag.mockResolvedValue(undefined);

      await ragService.updateFileMetadata("file-123", "user-123", updates);

      expect(mockFileDAO.updateFileMetadataForRag).toHaveBeenCalledWith(
        "uploads/test.pdf",
        "user-123",
        "Updated description",
        '["old", "tags"]'
      );
    });
  });

  describe("text extraction", () => {
    it("should extract text from PDF files", async () => {
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      // Test PDF extraction through the processFile method
      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: PDF content\nTAGS: [pdf]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.pdf",
        userId: "user-123",
        filename: "test-file.pdf",
        fileSize: 1024,
        contentType: "application/pdf",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      expect(result.description).toBe("PDF content");
      expect(result.tags).toEqual(["pdf"]);
    });

    it("should extract text from text files", async () => {
      const textContent = "This is a text file content";
      const mockFile = {
        arrayBuffer: vi
          .fn()
          .mockResolvedValue(new TextEncoder().encode(textContent)),
      };

      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: Text file content\nTAGS: [text]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.txt",
        userId: "user-123",
        filename: "test-file.txt",
        fileSize: 1024,
        contentType: "text/plain",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      expect(result.description).toBe("Text file content");
      expect(result.tags).toEqual(["text"]);
    });

    it("should extract text from JSON files", async () => {
      const jsonContent = '{"key": "value", "nested": {"data": "test"}}';
      const mockFile = {
        arrayBuffer: vi
          .fn()
          .mockResolvedValue(new TextEncoder().encode(jsonContent)),
      };

      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: JSON file content\nTAGS: [json]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.json",
        userId: "user-123",
        filename: "test-file.json",
        fileSize: 1024,
        contentType: "application/json",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      expect(result.description).toBe("JSON file content");
      expect(result.tags).toEqual(["json"]);
    });

    it("should handle unsupported file types", async () => {
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue("DESCRIPTION: \nTAGS: []\nSUGGESTIONS: []");

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.png",
        userId: "user-123",
        filename: "test-file.png",
        fileSize: 1024,
        contentType: "image/png",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
    });
  });

  describe("vector storage", () => {
    it("should generate vector ID for processed files", async () => {
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: Test content\nTAGS: [test]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.pdf",
        userId: "user-123",
        filename: "test-file.pdf",
        fileSize: 1024,
        contentType: "application/pdf",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      expect(result.vectorId).toMatch(/vector_file-123(_\d+)?(_fallback)?/);
    });

    it("should handle vector storage errors gracefully", async () => {
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      mockEnv.FILE_BUCKET.get.mockResolvedValue(mockFile);
      mockAI.run.mockResolvedValue(
        "DESCRIPTION: Test content\nTAGS: [test]\nSUGGESTIONS: [useful for testing]"
      );

      const result = await ragService.processFile({
        id: "file-123",
        fileKey: "uploads/test-file.pdf",
        userId: "user-123",
        filename: "test-file.pdf",
        fileSize: 1024,
        contentType: "application/pdf",
        description: "",
        tags: [],
        status: "uploaded",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      });

      // Even if vector storage fails, the method should not throw
      expect(result.vectorId).toMatch(/vector_file-123(_\d+)?(_fallback)?/);
    });
  });
});
