import { describe, it, expect, beforeEach, vi } from "vitest";
import { upload } from "../../src/routes/upload";
import { FILE_PROCESSING_CONFIG } from "../../src/constants";

// Mock service factory
vi.mock("../../src/services/service-factory", () => ({
  getUploadService: vi.fn(),
  getPDFProcessingService: vi.fn(),
  getMetadataService: vi.fn(),
  getErrorHandlingService: vi.fn(),
}));

vi.mock("../../src/middleware/auth", () => ({
  requireUserJwt: vi.fn().mockImplementation(async (c, next) => {
    // Mock the userAuth context
    c.set("userAuth", {
      type: "user-auth",
      username: "testuser",
      isAdmin: false,
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });
    await next();
  }),
  setUserAuth: vi.fn(),
}));

// Mock upload service
const mockUploadService = {
  startUpload: vi.fn(),
  uploadPart: vi.fn(),
  completeUpload: vi.fn(),
  getProgress: vi.fn(),
};

// Mock environment
const mockEnv = {
  FILE_BUCKET: {
    list: vi.fn(),
  },
  DB: {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    run: vi.fn(),
  },
  PDF_PROCESSING_QUEUE: {
    send: vi.fn().mockResolvedValue(undefined),
  },
} as any;

describe("Upload Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mocks
    const { getUploadService } = await import(
      "../../src/services/service-factory"
    );
    vi.mocked(getUploadService).mockReturnValue(mockUploadService as any);
  });

  describe("POST /start", () => {
    it("should start upload session successfully", async () => {
      const mockResult = {
        sessionId: "testuser-123",
        uploadId: "test-upload-id",
        fileKey: "testuser/123-test-file.pdf",
        totalParts: 1,
        autoRAGChunking: true,
      };

      mockUploadService.startUpload.mockResolvedValue(mockResult);

      const request = new Request("http://localhost/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          filename: "test-file.pdf",
          fileSize: FILE_PROCESSING_CONFIG.CHUNK_SIZE,
          contentType: "application/pdf",
          enableAutoRAGChunking: true,
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(mockUploadService.startUpload).toHaveBeenCalledWith(
        "testuser",
        "test-file.pdf",
        FILE_PROCESSING_CONFIG.CHUNK_SIZE,
        "application/pdf"
      );

      expect(response.status).toBe(200);
      const responseData = (await response.json()) as any;
      expect(responseData.sessionId).toBe("testuser-123");
    });

    it("should return 400 when filename is missing", async () => {
      const request = new Request("http://localhost/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          fileSize: FILE_PROCESSING_CONFIG.CHUNK_SIZE,
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Filename and fileSize are required");
    });

    it("should return 400 when fileSize is missing", async () => {
      const request = new Request("http://localhost/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          filename: "test-file.pdf",
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Filename and fileSize are required");
    });

    it("should handle upload service errors", async () => {
      mockUploadService.startUpload.mockRejectedValue(
        new Error("Upload failed")
      );

      const request = new Request("http://localhost/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          filename: "test-file.pdf",
          fileSize: FILE_PROCESSING_CONFIG.CHUNK_SIZE,
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Failed to start upload");
    });
  });

  describe("POST /part", () => {
    it("should upload part successfully", async () => {
      const mockResult = {
        etag: "test-etag",
        size: 1024,
        autoRAGChunks: ["chunk-1"],
      };

      mockUploadService.uploadPart.mockResolvedValue(mockResult);

      const formData = new FormData();
      formData.append("sessionId", "testuser-123");
      formData.append("partNumber", "1");
      formData.append("enableAutoRAGChunking", "true");

      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      const request = new Request("http://localhost/part", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-jwt",
        },
        body: formData,
      });

      const response = await upload.fetch(request, mockEnv);

      expect(mockUploadService.uploadPart).toHaveBeenCalledWith(
        "testuser-123",
        1,
        expect.any(ArrayBuffer)
      );

      expect(response.status).toBe(200);
      const responseData = (await response.json()) as any;
      expect(responseData.success).toBe(true);
    });

    it("should return 400 when required fields are missing", async () => {
      const formData = new FormData();
      formData.append("sessionId", "testuser-123");
      // Missing partNumber and file

      const request = new Request("http://localhost/part", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-jwt",
        },
        body: formData,
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe(
        "sessionId, partNumber, and file are required"
      );
    });

    it("should handle upload service errors", async () => {
      mockUploadService.uploadPart.mockRejectedValue(
        new Error("Upload failed")
      );

      const formData = new FormData();
      formData.append("sessionId", "testuser-123");
      formData.append("partNumber", "1");
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });
      formData.append("file", file);

      const request = new Request("http://localhost/part", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-jwt",
        },
        body: formData,
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Failed to upload part");
    });
  });

  describe("POST /complete", () => {
    it("should complete upload successfully", async () => {
      const mockResult = {
        fileKey: "testuser/123-test-file.pdf",
        metadata: {
          id: "metadata-123",
          filename: "test-file.pdf",
          fileSize: 1024,
        },
      };

      mockUploadService.completeUpload.mockResolvedValue(mockResult);

      // Mock R2 bucket list response
      mockEnv.FILE_BUCKET.list.mockResolvedValue({
        objects: [{ key: "testuser/part-1-test-file.pdf.chunk" }],
      });

      const request = new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          sessionId: "testuser-123",
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(mockUploadService.completeUpload).toHaveBeenCalledWith(
        "testuser-123"
      );
      expect(mockEnv.DB.run).toHaveBeenCalledWith();

      expect(response.status).toBe(200);
      const responseData = (await response.json()) as any;
      expect(responseData.success).toBe(true);
    });

    it("should return 400 when sessionId is missing", async () => {
      const request = new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({}),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("sessionId is required");
    });

    it("should handle upload service errors", async () => {
      mockUploadService.completeUpload.mockRejectedValue(
        new Error("Completion failed")
      );

      const request = new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          sessionId: "testuser-123",
        }),
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Failed to complete upload");
    });

    it("should handle database errors gracefully", async () => {
      const mockResult = {
        fileKey: "testuser/123-test-file.pdf",
        metadata: {
          id: "metadata-123",
          filename: "test-file.pdf",
          fileSize: 1024,
        },
      };

      mockUploadService.completeUpload.mockResolvedValue(mockResult);
      mockEnv.FILE_BUCKET.list.mockResolvedValue({
        objects: [{ key: "testuser/part-1-test-file.pdf.chunk" }],
      });

      // Mock database error
      mockEnv.DB.run.mockRejectedValue(new Error("Database error"));

      const request = new Request("http://localhost/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          sessionId: "testuser-123",
        }),
      });

      // Should still complete successfully despite database error
      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const responseData = (await response.json()) as any;
      expect(responseData.success).toBe(true);
      expect(responseData.fileKey).toBe("testuser/123-test-file.pdf");
    });
  });

  describe("GET /progress/:sessionId", () => {
    it("should return upload progress", async () => {
      const mockProgress = {
        uploadedParts: 1,
        totalParts: 2,
        percentage: 50,
        status: "uploading",
      };

      mockUploadService.getProgress.mockResolvedValue(mockProgress);

      const request = new Request("http://localhost/progress/testuser-123", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-jwt",
        },
      });

      const response = await upload.fetch(request, mockEnv);

      expect(mockUploadService.getProgress).toHaveBeenCalledWith(
        "testuser-123"
      );

      expect(response.status).toBe(200);
      const responseData = (await response.json()) as any;
      expect(responseData).toEqual({
        success: true,
        progress: mockProgress,
      });
    });

    it("should handle progress service errors", async () => {
      mockUploadService.getProgress.mockRejectedValue(
        new Error("Progress failed")
      );

      const request = new Request("http://localhost/progress/testuser-123", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-jwt",
        },
      });

      const response = await upload.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const responseData = (await response.json()) as any;
      expect(responseData.error).toBe("Failed to get progress");
    });
  });
});
