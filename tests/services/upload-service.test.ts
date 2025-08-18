import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadService } from "../../src/services/upload-service";
import type { UploadSession } from "../../src/types/upload";
import { FILE_PROCESSING_CONFIG } from "../../src/constants";

// Mock environment
const mockEnv = {
  FILE_BUCKET: {
    createMultipartUpload: vi.fn(),
    put: vi.fn(),
    resumeMultipartUpload: vi.fn(),
    completeMultipartUpload: vi.fn(),
  },
  UploadSession: {
    idFromName: vi.fn(),
    get: vi.fn(),
  },
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    run: vi.fn(),
  },
} as any;

// Mock Durable Object
const mockSessionObj = {
  fetch: vi.fn(),
};

describe("UploadService", () => {
  let uploadService: UploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadService = new UploadService(mockEnv);

    // Setup default mocks
    mockEnv.FILE_BUCKET.resumeMultipartUpload.mockReturnValue({
      uploadPart: vi.fn().mockResolvedValue({ etag: "test-etag" }),
      abort: vi.fn().mockResolvedValue(undefined),
    });
  });

  describe("startUpload", () => {
    it("should start upload session successfully", async () => {
      const mockMultipartUpload = {
        uploadId: "test-upload-id",
      };
      mockEnv.FILE_BUCKET.createMultipartUpload.mockResolvedValue(
        mockMultipartUpload
      );

      const mockSessionStub = "session-stub";
      mockEnv.UploadSession.idFromName.mockReturnValue(mockSessionStub);
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);

      const mockResponse = { ok: true };
      mockSessionObj.fetch.mockResolvedValue(mockResponse);

      const result = await uploadService.startUpload(
        "testuser",
        "test-file.pdf",
        FILE_PROCESSING_CONFIG.CHUNK_SIZE,
        "application/pdf"
      );

      expect(result.sessionId).toMatch(/testuser-\d+/);
      expect(result.uploadId).toBe("test-upload-id");
      expect(result.fileKey).toMatch(/testuser\/\d+-test-file\.pdf/);
      expect(result.totalParts).toBe(1);
      expect(result.autoRAGChunking).toBe(true);

      expect(mockEnv.FILE_BUCKET.createMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/testuser\/\d+-test-file\.pdf/),
        { httpMetadata: { contentType: "application/pdf" } }
      );
    });

    it("should calculate correct number of parts for large files", async () => {
      const mockMultipartUpload = { uploadId: "test-upload-id" };
      mockEnv.FILE_BUCKET.createMultipartUpload.mockResolvedValue(
        mockMultipartUpload
      );

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch.mockResolvedValue({ ok: true });

      const result = await uploadService.startUpload(
        "testuser",
        "large-file.pdf",
        15 * FILE_PROCESSING_CONFIG.CHUNK_SIZE
      );

      expect(result.totalParts).toBe(15);
    });

    it("should throw error when session creation fails", async () => {
      const mockMultipartUpload = { uploadId: "test-upload-id" };
      mockEnv.FILE_BUCKET.createMultipartUpload.mockResolvedValue(
        mockMultipartUpload
      );

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch.mockResolvedValue({ ok: false });

      await expect(
        uploadService.startUpload("testuser", "test-file.pdf", 1024)
      ).rejects.toThrow("Failed to create upload session");
    });
  });

  describe("uploadPart", () => {
    it("should upload part successfully", async () => {
      const mockSession = {
        userId: "testuser",
        fileKey: "testuser/123-test-file.pdf",
        uploadId: "test-upload-id",
        totalParts: 1,
        uploadedParts: 0,
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSession),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ etag: "test-etag" }),
        });

      mockEnv.FILE_BUCKET.put.mockResolvedValue({ etag: "test-etag" });

      const chunk = new ArrayBuffer(1024);
      const result = await uploadService.uploadPart("testuser-123", 1, chunk);

      expect(result.etag).toBe("test-etag");
      expect(result.size).toBe(1024);
      expect(result.autoRAGChunks).toBeDefined();
    });

    it("should create AutoRAG parts for PDF files", async () => {
      const mockSession = {
        userId: "testuser",
        fileKey: "testuser/123-test-file.pdf",
        uploadId: "test-upload-id",
        totalParts: 1,
        uploadedParts: 0,
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSession),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ etag: "test-etag" }),
        });

      mockEnv.FILE_BUCKET.put.mockResolvedValue({ etag: "test-etag" });

      const chunk = new ArrayBuffer(1024);
      const result = await uploadService.uploadPart("testuser-123", 1, chunk);

      expect(result.autoRAGChunks).toHaveLength(1);
      expect(mockEnv.FILE_BUCKET.put).toHaveBeenCalledWith(
        "testuser/part-1-123-test-file.pdf.chunk",
        chunk,
        {
          httpMetadata: {
            contentType: "application/octet-stream",
          },
        }
      );
    });

    it("should throw error when session not found", async () => {
      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch.mockResolvedValue({ ok: false });

      const chunk = new ArrayBuffer(1024);
      await expect(
        uploadService.uploadPart("testuser-123", 1, chunk)
      ).rejects.toThrow("Upload session not found");
    });
  });

  describe("completeUpload", () => {
    it("should complete upload successfully", async () => {
      vi.clearAllMocks();

      const mockSession: UploadSession = {
        id: "session-123",
        userId: "testuser",
        fileKey: "testuser/123-test-file.pdf",
        uploadId: "test-upload-id",
        filename: "test-file.pdf",
        fileSize: 1024,
        totalParts: 1,
        uploadedParts: 1,
        status: "uploading",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        autoRAGChunking: true,
      };

      // Create a fresh mock for this test
      const freshMockSessionObj = {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              session: mockSession,
              parts: [],
            }),
        }),
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(freshMockSessionObj);

      const result = await uploadService.completeUpload("testuser-123");

      expect(result.fileKey).toBe("testuser/123-test-file.pdf");
      expect(result.metadata).toBeDefined();
    });

    it("should skip original file completion when AutoRAG parts exist", async () => {
      const mockSession: UploadSession = {
        id: "session-123",
        userId: "testuser",
        fileKey: "testuser/123-test-file.pdf",
        uploadId: "test-upload-id",
        filename: "test-file.pdf",
        fileSize: 1024,
        totalParts: 1,
        uploadedParts: 1,
        status: "uploading",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        autoRAGChunking: true,
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: mockSession,
            parts: [],
          }),
      });

      await uploadService.completeUpload("testuser-123");

      // Should not call completeMultipartUpload since AutoRAG parts were created
      expect(
        mockEnv.FILE_BUCKET.completeMultipartUpload
      ).not.toHaveBeenCalled();
    });
  });

  describe("getProgress", () => {
    it("should return upload progress", async () => {
      const mockSession: UploadSession = {
        id: "session-123",
        userId: "testuser",
        fileKey: "testuser/123-test-file.pdf",
        uploadId: "test-upload-id",
        filename: "test-file.pdf",
        fileSize: 1024,
        totalParts: 1,
        uploadedParts: 1,
        status: "uploading",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        autoRAGChunking: true,
      };

      // Create a fresh mock for this test
      const freshMockSessionObj = {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockSession),
        }),
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(freshMockSessionObj);

      const progress = await uploadService.getProgress("testuser-123");

      expect(progress.uploadedParts).toBe(1);
      expect(progress.totalParts).toBe(1);
      expect(progress.percentage).toBe(100);
      expect(progress.status).toBe("uploading");
    });

    it("should throw error when session not found", async () => {
      vi.clearAllMocks();

      // Create a fresh mock for this test
      const freshMockSessionObj = {
        fetch: vi.fn().mockResolvedValue({
          ok: false,
        }),
      };

      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(freshMockSessionObj);

      await expect(uploadService.getProgress("testuser-123")).rejects.toThrow(
        "Upload session not found"
      );
    });
  });

  describe("cleanupSession", () => {
    it("should cleanup session successfully", async () => {
      mockEnv.UploadSession.idFromName.mockReturnValue("session-stub");
      mockEnv.UploadSession.get.mockReturnValue(mockSessionObj);
      mockSessionObj.fetch.mockResolvedValue({ ok: true });

      await uploadService.cleanupSession("testuser-123");

      expect(mockSessionObj.fetch).toHaveBeenCalledWith(
        "https://dummy.com?action=delete",
        { method: "DELETE" }
      );
    });
  });
});
