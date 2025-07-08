import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/server";
import {
  type Env,
  createSessionFileTrackerStub,
  ensurePdfAuthOverrideDisabled,
} from "./testUtils";

// Ensure PDF auth override is disabled for all tests
ensurePdfAuthOverrideDisabled();

// Define response types
type UploadUrlResponse = {
  uploadUrl: string;
  fileKey: string;
  sessionId: string;
};

type ErrorResponse = {
  error: string;
};

/**
 * PDF Upload Test Suite
 *
 * This test suite covers the PDF upload functionality:
 * - Upload URL generation endpoint (/pdf/upload-url)
 * - Direct file upload endpoint (/pdf/upload/*)
 * - File validation and processing
 *
 * The upload flow involves:
 * 1. User requests upload URL with sessionId, fileName, and fileSize
 * 2. System validates session authentication
 * 3. System generates unique file key and upload URL
 * 4. System tracks file metadata in SessionFileTracker
 * 5. User uploads file directly to the generated URL
 * 6. System stores file in R2 bucket
 */

describe("PDF Upload URL Generation", () => {
  let env: Env;
  let sessionTrackerStub: ReturnType<typeof createSessionFileTrackerStub>;

  beforeEach(() => {
    sessionTrackerStub = createSessionFileTrackerStub(true);
    env = {
      SessionFileTracker: {
        idFromName: vi.fn(() => "stub-id"),
        get: vi.fn(() => sessionTrackerStub),
      },
    };
  });

  /**
   * Test Case: Successful Upload URL Generation
   *
   * Scenario: User provides valid sessionId, fileName, and fileSize for an authenticated session
   *
   * Expected Behavior:
   * - Returns HTTP 200 status
   * - Returns JSON with uploadUrl, fileKey, and sessionId
   * - Upload URL follows expected pattern (/pdf/upload/...)
   * - File key includes session and filename (uploads/sessionId/filename)
   *
   * This is the happy path that validates the core upload URL generation functionality.
   */
  it("returns a valid upload URL when authenticated", async () => {
    const requestBody = {
      sessionId: "test-session",
      fileName: "test.pdf",
      fileSize: 12345,
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as UploadUrlResponse;
    expect(json).toHaveProperty("uploadUrl");
    expect(json).toHaveProperty("fileKey");
    expect(json).toHaveProperty("sessionId", "test-session");
    expect(json.uploadUrl).toContain("/pdf/upload/");
    expect(json.fileKey).toContain("uploads/test-session/test.pdf");
  });

  /**
   * Test Case: Unauthenticated Session (Default State)
   *
   * Scenario: User provides valid request parameters but the session is not authenticated
   *
   * Expected Behavior:
   * - Returns HTTP 401 Unauthorized status
   * - Returns error message "Session not authenticated"
   * - Prevents unauthorized access to upload functionality
   *
   * This test validates that the authentication check works correctly
   * when the session exists but hasn't been authenticated.
   */
  it("returns 401 if not authenticated", async () => {
    sessionTrackerStub = createSessionFileTrackerStub(false);
    env.SessionFileTracker.get = vi.fn(() => sessionTrackerStub);
    const requestBody = {
      sessionId: "test-session",
      fileName: "test.pdf",
      fileSize: 12345,
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(401);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error", "Session not authenticated");
  });

  /**
   * Test Case: Missing Required Fields
   *
   * Scenario: User omits required fields (sessionId) from the request body
   *
   * Expected Behavior:
   * - Returns HTTP 400 Bad Request status
   * - Returns error message indicating missing required fields
   * - Prevents processing with incomplete data
   *
   * This test validates input validation for required fields.
   * The sessionId is essential for tracking uploads and authentication.
   */
  it("returns 400 if missing sessionId or fileName", async () => {
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "test.pdf" }),
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error");
  });

  /**
   * Test Case: Explicitly Unauthenticated Session
   *
   * Scenario: User provides a valid sessionId but the session is explicitly not authenticated
   *
   * Expected Behavior:
   * - Returns HTTP 401 Unauthorized status
   * - Returns error message "Session not authenticated"
   * - Verifies that SessionFileTracker methods are called with correct parameters
   * - Prevents unauthorized access to upload functionality
   *
   * This test validates the authentication flow when a session exists
   * but has been explicitly marked as unauthenticated. It also verifies
   * that the Durable Object interaction works correctly.
   */
  it("returns 401 if sessionId is provided but session is not authenticated", async () => {
    // Create a stub that returns false for authentication check
    const unauthenticatedStub = createSessionFileTrackerStub(false);
    env.SessionFileTracker.get = vi.fn(() => unauthenticatedStub);

    const requestBody = {
      sessionId: "unauthenticated-session",
      fileName: "test.pdf",
      fileSize: 12345,
    };
    const req = new Request("http://localhost/pdf/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(401);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error", "Session not authenticated");

    // Verify that the SessionFileTracker was called with the correct sessionId
    expect(env.SessionFileTracker.idFromName).toHaveBeenCalledWith(
      "unauthenticated-session"
    );
    expect(env.SessionFileTracker.get).toHaveBeenCalled();
  });
});

describe("PDF Direct File Upload", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      SessionFileTracker: {
        idFromName: vi.fn(() => "stub-id"),
        get: vi.fn(() => createSessionFileTrackerStub(true)),
      },
      PDF_BUCKET: {
        put: vi.fn(async () => ({ success: true })),
      },
    };
  });

  /**
   * Test Case: Successful File Upload
   *
   * Scenario: User uploads a PDF file directly to the upload URL
   *
   * Expected Behavior:
   * - Returns HTTP 200 status
   * - File is stored in R2 bucket
   * - File key is extracted from URL path
   *
   * This validates the direct file upload functionality.
   */
  it("uploads file successfully to R2 bucket", async () => {
    const fileContent = new ArrayBuffer(1024); // Mock PDF content
    const fileKey = "uploads/test-session/test.pdf";

    const req = new Request(`http://localhost/pdf/upload/${fileKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: fileContent,
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(200);

    // Verify that the file was stored in R2
    expect(env.PDF_BUCKET?.put).toHaveBeenCalledWith(fileKey, fileContent, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });
  });

  /**
   * Test Case: Missing File Key
   *
   * Scenario: Upload request is made without a file key in the URL
   *
   * Expected Behavior:
   * - Returns HTTP 400 status
   * - Returns error message about missing file key
   *
   * This validates input validation for the upload endpoint.
   */
  it("returns 400 if file key is missing", async () => {
    const req = new Request("http://localhost/pdf/upload/", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new ArrayBuffer(1024),
    });

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error");
  });

  /**
   * Test Case: Empty File Content
   *
   * Scenario: User attempts to upload an empty file
   *
   * Expected Behavior:
   * - Returns HTTP 400 status
   * - Returns error message about empty file content
   *
   * This validates that empty files are rejected.
   */
  it("returns 400 if file content is empty", async () => {
    const req = new Request(
      "http://localhost/pdf/upload/uploads/test-session/empty.pdf",
      {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: new ArrayBuffer(0), // Empty file
      }
    );

    const res = await app.request(req, undefined, env);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorResponse;
    expect(json).toHaveProperty("error", "File content is empty");
  });
});
