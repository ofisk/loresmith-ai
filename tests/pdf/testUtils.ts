import { vi } from "vitest";

// Define proper types for the environment and stubs
type SessionFileTrackerStub = {
  fetch: ReturnType<typeof vi.fn>;
};

type PdfBucketStub = {
  put: ReturnType<typeof vi.fn>;
};

/**
 * Shared environment type for PDF tests
 * Defines the structure of the environment object passed to the Hono app
 */
export type Env = {
  SessionFileTracker: {
    idFromName: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  PDF_BUCKET?: PdfBucketStub;
  ADMIN_SECRET?: string;
};

/**
 * Default stub for SessionFileTracker Durable Object for most tests.
 * Shortcuts authentication: always returns the provided authenticated value.
 * Use for tests that do NOT care about real authentication logic.
 *
 * @param authenticated - Whether the session should be considered authenticated
 * @param files - Array of file objects to return for listing
 * @param ingestionSuccess - Whether ingestion should succeed
 * @returns Mock Durable Object stub with fetch method
 */
export function createSessionFileTrackerStub(
  authenticated = true,
  files: unknown[] = [],
  ingestionSuccess = true
): SessionFileTrackerStub {
  return {
    fetch: vi.fn(async (url, options) => {
      // Authentication status check
      if (url.endsWith("is-session-authenticated")) {
        return {
          status: 200,
          json: async () => ({ authenticated }),
        };
      }
      // File listing endpoint
      if (url.includes("get-files")) {
        return {
          status: 200,
          json: async () => ({ files }),
        };
      }
      // Metadata update endpoint
      if (url.endsWith("update-metadata")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            fileKey: "test-file-key",
            metadata: {
              description: "Updated description",
              tags: ["tag1", "tag2"],
            },
          }),
        };
      }
      // Ingestion endpoint
      if (url.endsWith("ingest")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        if (ingestionSuccess) {
          return {
            status: 200,
            json: async () => ({
              success: true,
              fileKey: "test-file-key",
              status: "processing",
            }),
          };
        }
        return {
          status: 500,
          json: async () => ({
            success: false,
            error: "Ingestion failed",
          }),
        };
      }
      // Add file endpoint (for upload tests)
      if (url.endsWith("add-file")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      // Update status endpoint - requires authentication
      if (url.endsWith("update-status")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      // Remove file endpoint - requires authentication
      if (url.endsWith("remove-file")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      // Delete session endpoint - requires authentication
      if (url.endsWith("delete-session")) {
        if (!authenticated) {
          return {
            status: 401,
            json: async () => ({ error: "Session not authenticated" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      return { status: 404, json: async () => ({}) };
    }),
  };
}

/**
 * Real-authentication stub for SessionFileTracker Durable Object.
 * Provides minimal responses for authentication endpoints to let server parse correctly.
 * Use for authentication-related tests that need to exercise real auth logic.
 *
 * @param files - Array of file objects to return for listing
 * @param ingestionSuccess - Whether ingestion should succeed
 * @returns Mock Durable Object stub with fetch method
 */
export function createSessionFileTrackerAuthStub(
  files: unknown[] = [],
  ingestionSuccess = true
): SessionFileTrackerStub {
  return {
    fetch: vi.fn(async (url, options) => {
      // Authentication status check - return unauthenticated by default
      if (url.endsWith("is-session-authenticated")) {
        return {
          status: 404,
          json: async () => ({ authenticated: false }),
        };
      }
      // Session authentication validation - return failure by default
      if (url.endsWith("validate-session-auth")) {
        return {
          status: 404,
          json: async () => ({
            success: false,
            authenticated: false,
            error: "Invalid admin key",
          }),
        };
      }
      // File listing endpoint
      if (url.includes("get-files")) {
        return {
          status: 200,
          json: async () => ({ files }),
        };
      }
      // Metadata update endpoint
      if (url.endsWith("update-metadata")) {
        return {
          status: 200,
          json: async () => ({
            success: true,
            fileKey: "test-file-key",
            metadata: {
              description: "Updated description",
              tags: ["tag1", "tag2"],
            },
          }),
        };
      }
      // Ingestion endpoint
      if (url.endsWith("ingest")) {
        if (ingestionSuccess) {
          return {
            status: 200,
            json: async () => ({
              success: true,
              fileKey: "test-file-key",
              status: "processing",
            }),
          };
        }
        return {
          status: 500,
          json: async () => ({
            success: false,
            error: "Ingestion failed",
          }),
        };
      }
      // Add file endpoint (for upload tests)
      if (url.endsWith("add-file")) {
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      // For any other endpoints, return 404
      return { status: 404, json: async () => ({}) };
    }),
  };
}
