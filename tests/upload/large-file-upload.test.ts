import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleCompleteLargeUpload,
  handleStartLargeUpload,
  handleUploadPart,
} from "../../src/routes/upload";
import { API_CONFIG } from "../../src/shared-config";

// Mock environment
const mockEnv = {
  R2: {
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  },
  UPLOAD_SESSION: {
    idFromName: vi.fn(),
    get: vi.fn(),
  },
  DB: {} as any,
  VECTORIZE: {} as any,
  AI: {} as any,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
  AUTORAG_PREFIX: "loresmith-files/library",
};

// Mock context
const createMockContext = (data: any) => ({
  req: {
    json: vi.fn().mockResolvedValue(data),
    param: vi.fn(),
    header: vi.fn(),
    arrayBuffer: vi.fn(),
  },
  env: mockEnv,
  json: vi.fn(),
});

describe("Large File Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleStartLargeUpload", () => {
    it("should start a large file upload session", async () => {
      const mockMultipartUpload = {
        uploadId: "test-upload-id",
        abort: vi.fn(),
      };

      const mockUploadSession = {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ success: true }),
        }),
      };

      mockEnv.R2.createMultipartUpload.mockResolvedValue(mockMultipartUpload);
      mockEnv.UPLOAD_SESSION.idFromName.mockReturnValue("test-id");
      mockEnv.UPLOAD_SESSION.get.mockReturnValue(mockUploadSession);

      const context = createMockContext({
        filename: "large-file.pdf",
        fileSize: 150 * 1024 * 1024, // 150MB
        contentType: "application/pdf",
      });

      (context as any).userAuth = { username: "testuser" };

      await handleStartLargeUpload(context as any);

      expect(mockEnv.R2.createMultipartUpload).toHaveBeenCalledWith(
        "library/testuser/c4be7b4dd6c8a355/large-file.pdf",
        {
          httpMetadata: {
            contentType: "application/pdf",
          },
          customMetadata: {
            file_key: "library/testuser/c4be7b4dd6c8a355/large-file.pdf",
            user: "testuser",
            original_name: "large-file.pdf",
          },
        }
      );

      expect(mockUploadSession.fetch).toHaveBeenCalledWith(
        expect.stringContaining(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_CREATE),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should reject files smaller than 100MB", async () => {
      const context = createMockContext({
        filename: "small-file.pdf",
        fileSize: 50 * 1024 * 1024, // 50MB
        contentType: "application/pdf",
      });

      (context as any).userAuth = { username: "testuser" };

      await handleStartLargeUpload(context as any);

      expect(context.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("File size must be at least 100MB"),
        }),
        400
      );
    });
  });

  describe("handleUploadPart", () => {
    it("should upload a file part", async () => {
      const mockMultipartUpload = {
        uploadPart: vi.fn().mockResolvedValue({
          etag: "test-etag",
        }),
      };

      const mockUploadSession = {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
              userId: "testuser",
              fileKey: "library/testuser/test.pdf",
              uploadId: "test-upload-id",
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ success: true }),
          }),
      };

      mockEnv.R2.resumeMultipartUpload.mockReturnValue(mockMultipartUpload);
      mockEnv.UPLOAD_SESSION.idFromName.mockReturnValue("test-id");
      mockEnv.UPLOAD_SESSION.get.mockReturnValue(mockUploadSession);

      const context = createMockContext({});
      context.req.param.mockImplementation((param: string) => {
        if (param === "sessionId") return "test-session";
        if (param === "partNumber") return "1";
        return null;
      });
      context.req.arrayBuffer.mockResolvedValue(new ArrayBuffer(1024));

      (context as any).userAuth = { username: "testuser" };

      await handleUploadPart(context as any);

      expect(mockEnv.R2.resumeMultipartUpload).toHaveBeenCalledWith(
        "library/testuser/test.pdf",
        "test-upload-id"
      );

      expect(mockMultipartUpload.uploadPart).toHaveBeenCalledWith(
        1,
        expect.any(ArrayBuffer)
      );
    });
  });

  describe("handleCompleteLargeUpload", () => {
    it("should complete a multipart upload", async () => {
      const mockMultipartUpload = {
        complete: vi.fn().mockResolvedValue({}),
      };

      const mockUploadSession = {
        fetch: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
              userId: "testuser",
              fileKey: "library/testuser/test.pdf",
              uploadId: "test-upload-id",
              filename: "test.pdf",
              fileSize: 150 * 1024 * 1024,
              uploadedParts: 3,
              totalParts: 3,
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
              parts: [
                { partNumber: 1, etag: "etag1" },
                { partNumber: 2, etag: "etag2" },
                { partNumber: 3, etag: "etag3" },
              ],
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ success: true }),
          }),
      };

      mockEnv.R2.resumeMultipartUpload.mockReturnValue(mockMultipartUpload);
      mockEnv.UPLOAD_SESSION.idFromName.mockReturnValue("test-id");
      mockEnv.UPLOAD_SESSION.get.mockReturnValue(mockUploadSession);

      const context = createMockContext({});
      context.req.param.mockReturnValue("test-session");

      (context as any).userAuth = { username: "testuser" };

      await handleCompleteLargeUpload(context as any);

      expect(mockMultipartUpload.complete).toHaveBeenCalledWith([
        { partNumber: 1, etag: "etag1" },
        { partNumber: 2, etag: "etag2" },
        { partNumber: 3, etag: "etag3" },
      ]);
    });

    it("should reject incomplete uploads", async () => {
      const mockUploadSession = {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            userId: "testuser",
            uploadedParts: 2,
            totalParts: 3,
          }),
        }),
      };

      mockEnv.UPLOAD_SESSION.idFromName.mockReturnValue("test-id");
      mockEnv.UPLOAD_SESSION.get.mockReturnValue(mockUploadSession);

      const context = createMockContext({});
      context.req.param.mockReturnValue("test-session");

      (context as any).userAuth = { username: "testuser" };

      await handleCompleteLargeUpload(context as any);

      expect(context.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining(
            "Upload incomplete. 2/3 parts uploaded"
          ),
        }),
        400
      );
    });
  });
});
