import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/server";

// Define response types
type UploadUrlResponse = {
  uploadUrl: string;
  fileKey: string;
  username: string;
};

type ErrorResponse = {
  error: string;
};

type UploadResponse = {
  success: boolean;
  fileKey: string;
  message: string;
};

// Create a valid JWT for testing
const TEST_ADMIN_SECRET = "test-admin-secret";
const TEST_JWT_SECRET = new TextEncoder().encode(TEST_ADMIN_SECRET);

async function createTestJwt(username = "test-user"): Promise<string> {
  return await new SignJWT({ type: "user-auth", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(TEST_JWT_SECRET);
}

/**
 * PDF Upload Test Suite
 *
 * This test suite covers the PDF upload functionality:
 * - Upload URL generation endpoint (/pdf/upload-url)
 * - Direct file upload endpoint (/pdf/upload/*)
 * - File validation and error handling
 *
 * The upload flow involves:
 * 1. Client requests upload URL with file metadata
 * 2. Server generates presigned URL for direct R2 upload
 * 3. Client uploads file directly to R2 using the URL
 * 4. Server validates upload and updates file tracking
 */

describe("PDF Upload URL Generation", () => {
  let env: Env;
  let testJwt: string;

  beforeEach(async () => {
    testJwt = await createTestJwt();
    env = {
      ADMIN_SECRET: TEST_ADMIN_SECRET,
      PDF_BUCKET: {
        put: vi.fn().mockResolvedValue(undefined),
      } as unknown,
    } as Env;
  });

  /**
   * Test Case: Generate Upload URL Successfully
   *
   * Scenario: User requests upload URL with valid JWT and file metadata
   *
   * Expected Behavior:
   * - Returns HTTP 200 status
   * - Returns uploadUrl and fileKey
   * - URL points to direct R2 upload endpoint
   *
   * This validates that users can get upload URLs for their files.
   */
  it("returns a valid upload URL when authenticated", async () => {
    const requestBody = {
      fileName: "test-document.pdf",
      fileSize: 1024000, // 1MB
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify(requestBody),
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as UploadUrlResponse;
    expect(json).toHaveProperty("uploadUrl");
    expect(json).toHaveProperty("fileKey");
    expect(json).toHaveProperty("username");
    expect(json.uploadUrl).toMatch(/^\/pdf\/upload\//);
    expect(json.fileKey).toMatch(/^uploads\/test-user\/test-document\.pdf$/);
  });

  /**
   * Test Case: Unauthenticated Request
   *
   * Scenario: User requests upload URL without JWT authentication
   *
   * Expected Behavior:
   * - Returns HTTP 401 status
   * - Returns error message about missing authorization
   *
   * This validates that upload URL generation requires authentication.
   */
  it("returns 401 if not authenticated", async () => {
    const requestBody = {
      fileName: "test-document.pdf",
      fileSize: 1024000,
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(401);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty(
      "error",
      "Missing or invalid Authorization header"
    );
  });

  /**
   * Test Case: Missing Required Fields
   *
   * Scenario: User omits required fields from upload URL request
   *
   * Expected Behavior:
   * - Returns HTTP 400 status
   * - Returns error message about missing fields
   *
   * This validates input validation for the upload URL endpoint.
   */
  it("returns 400 if missing fileName", async () => {
    const requestBody = {
      fileSize: 1024000,
      // Missing fileName
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify(requestBody),
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error");
  });
});

describe("PDF Direct File Upload", () => {
  let env: Env;
  let testJwt: string;

  beforeEach(async () => {
    testJwt = await createTestJwt();
    env = {
      ADMIN_SECRET: TEST_ADMIN_SECRET,
      PDF_BUCKET: {
        put: vi.fn().mockResolvedValue(undefined),
      } as unknown,
    } as Env;
  });

  /**
   * Test Case: Successful File Upload
   *
   * Scenario: User uploads file directly to R2 using presigned URL
   *
   * Expected Behavior:
   * - Returns HTTP 200 status
   * - Returns success confirmation with fileKey
   * - File is stored in R2 bucket
   *
   * This validates that files can be uploaded successfully to R2.
   */
  it("uploads file successfully to R2 bucket", async () => {
    const fileContent = new ArrayBuffer(1024); // 1KB test file
    const fileKey = "uploads/test-user/test-document.pdf";

    const req = new Request(`http://localhost/pdf/upload/${fileKey}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        Authorization: `Bearer ${testJwt}`,
      },
      body: fileContent,
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);

    // Verify that the file was stored in R2
    expect(env.PDF_BUCKET.put).toHaveBeenCalledWith(
      fileKey,
      fileContent,
      expect.objectContaining({
        httpMetadata: {
          contentType: "application/pdf",
        },
      })
    );

    const json = (await res.json()) as UploadResponse;
    expect(json).toHaveProperty("success", true);
    expect(json).toHaveProperty("fileKey", fileKey);
    expect(json).toHaveProperty("message", "File uploaded successfully");
  });

  /**
   * Test Case: Missing File Key
   *
   * Scenario: User attempts upload without specifying file key
   *
   * Expected Behavior:
   * - Returns HTTP 400 status
   * - Returns error message about missing file key
   *
   * This validates that file key is required for uploads.
   */
  it("returns 400 if file key is missing", async () => {
    const fileContent = new ArrayBuffer(1024);

    const req = new Request("http://localhost/pdf/upload/", {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        Authorization: `Bearer ${testJwt}`,
      },
      body: fileContent,
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error");
  });

  /**
   * Test Case: Empty File Content
   *
   * Scenario: User attempts to upload empty file
   *
   * Expected Behavior:
   * - Returns HTTP 400 status
   * - Returns error message about empty file content
   *
   * This validates that files must have content.
   */
  it("returns 400 if file content is empty", async () => {
    const fileContent = new ArrayBuffer(0); // Empty file
    const fileKey = "uploads/test-user/empty-file.pdf";

    const req = new Request(`http://localhost/pdf/upload/${fileKey}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        Authorization: `Bearer ${testJwt}`,
      },
      body: fileContent,
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error", "File content is empty");
  });
});
