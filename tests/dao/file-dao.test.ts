import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileDAO } from "../../src/dao/file-dao";
import type {
  D1Database,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";

// Mock D1Database
const mockDB = {
  prepare: vi.fn(),
  batch: vi.fn(),
} as unknown as D1Database;

// Mock R2Bucket
const mockR2Bucket = {
  delete: vi.fn(),
} as unknown as R2Bucket;

// Mock VectorizeIndex
const mockVectorizeIndex = {
  deleteByIds: vi.fn(),
} as unknown as VectorizeIndex;

describe("FileDAO", () => {
  let fileDAO: FileDAO;
  let mockPreparedStatement: any;

  beforeEach(() => {
    fileDAO = new FileDAO(mockDB);
    mockPreparedStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    vi.clearAllMocks();
    (mockDB.prepare as any).mockReturnValue(mockPreparedStatement);
  });

  describe("deleteFile", () => {
    it("should delete file from database only when no external services provided", async () => {
      const fileKey = "test-file-key";

      // Mock getFileMetadata to return null (file doesn't exist)
      mockPreparedStatement.first.mockResolvedValue(null);

      // Mock transaction execution
      mockPreparedStatement.run.mockResolvedValue({});

      await fileDAO.deleteFile(fileKey);

      // Should call getFileMetadata
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "SELECT * FROM file_metadata WHERE file_key = ?"
      );
      expect(mockPreparedStatement.bind).toHaveBeenCalledWith(fileKey);
      expect(mockPreparedStatement.first).toHaveBeenCalled();

      // Should execute transaction with delete operations
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM pdf_chunks WHERE file_key = ?"
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM file_metadata WHERE file_key = ?"
      );
    });

    it("should delete file from database, R2, and vector index when all services provided", async () => {
      const fileKey = "test-file-key";
      const mockMetadata = {
        id: "test-id",
        file_key: fileKey,
        filename: "test.pdf",
        username: "testuser",
        file_size: 1024,
        content_type: "application/pdf",
        vector_id: "vector-123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Mock getFileMetadata to return metadata
      mockPreparedStatement.first.mockResolvedValue(mockMetadata);

      // Mock transaction execution
      mockPreparedStatement.run.mockResolvedValue({});

      // Mock R2 and Vectorize operations
      (mockR2Bucket.delete as any).mockResolvedValue(undefined);
      (mockVectorizeIndex.deleteByIds as any).mockResolvedValue(undefined);

      await fileDAO.deleteFile(fileKey, mockR2Bucket, mockVectorizeIndex);

      // Should call getFileMetadata
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "SELECT * FROM file_metadata WHERE file_key = ?"
      );

      // Should execute transaction with delete operations
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM pdf_chunks WHERE file_key = ?"
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM file_metadata WHERE file_key = ?"
      );

      // Should delete from R2
      expect(mockR2Bucket.delete).toHaveBeenCalledWith(fileKey);

      // Should delete from vector index
      expect(mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith([
        mockMetadata.vector_id,
      ]);
    });

    it("should handle R2 deletion errors gracefully", async () => {
      const fileKey = "test-file-key";
      const mockMetadata = {
        id: "test-id",
        file_key: fileKey,
        filename: "test.pdf",
        username: "testuser",
        file_size: 1024,
        content_type: "application/pdf",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Mock getFileMetadata to return metadata
      mockPreparedStatement.first.mockResolvedValue(mockMetadata);

      // Mock transaction execution
      mockPreparedStatement.run.mockResolvedValue({});

      // Mock R2 deletion to fail
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      (mockR2Bucket.delete as any).mockRejectedValue(
        new Error("R2 deletion failed")
      );

      await fileDAO.deleteFile(fileKey, mockR2Bucket);

      // Should still complete successfully despite R2 error
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM pdf_chunks WHERE file_key = ?"
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM file_metadata WHERE file_key = ?"
      );
      expect(mockR2Bucket.delete).toHaveBeenCalledWith(fileKey);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete file from R2"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should handle vector index deletion errors gracefully", async () => {
      const fileKey = "test-file-key";
      const mockMetadata = {
        id: "test-id",
        file_key: fileKey,
        filename: "test.pdf",
        username: "testuser",
        file_size: 1024,
        content_type: "application/pdf",
        vector_id: "vector-123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Mock getFileMetadata to return metadata
      mockPreparedStatement.first.mockResolvedValue(mockMetadata);

      // Mock transaction execution
      mockPreparedStatement.run.mockResolvedValue({});

      // Mock R2 deletion to succeed
      (mockR2Bucket.delete as any).mockResolvedValue(undefined);

      // Mock vector index deletion to fail
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      (mockVectorizeIndex.deleteByIds as any).mockRejectedValue(
        new Error("Vector deletion failed")
      );

      await fileDAO.deleteFile(fileKey, mockR2Bucket, mockVectorizeIndex);

      // Should still complete successfully despite vector index error
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM pdf_chunks WHERE file_key = ?"
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM file_metadata WHERE file_key = ?"
      );
      expect(mockR2Bucket.delete).toHaveBeenCalledWith(fileKey);
      expect(mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith([
        mockMetadata.vector_id,
      ]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete vector embeddings"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should not attempt vector index deletion when no vector_id exists", async () => {
      const fileKey = "test-file-key";
      const mockMetadata = {
        id: "test-id",
        file_key: fileKey,
        filename: "test.pdf",
        username: "testuser",
        file_size: 1024,
        content_type: "application/pdf",
        // No vector_id
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Mock getFileMetadata to return metadata
      mockPreparedStatement.first.mockResolvedValue(mockMetadata);

      // Mock transaction execution
      mockPreparedStatement.run.mockResolvedValue({});

      // Mock R2 deletion to succeed
      (mockR2Bucket.delete as any).mockResolvedValue(undefined);

      await fileDAO.deleteFile(fileKey, mockR2Bucket, mockVectorizeIndex);

      // Should delete from database and R2
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM pdf_chunks WHERE file_key = ?"
      );
      expect(mockDB.prepare).toHaveBeenCalledWith(
        "DELETE FROM file_metadata WHERE file_key = ?"
      );
      expect(mockR2Bucket.delete).toHaveBeenCalledWith(fileKey);

      // Should NOT attempt vector index deletion
      expect(mockVectorizeIndex.deleteByIds).not.toHaveBeenCalled();
    });
  });
});
