import { jwtVerify } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuthRequest,
  AuthService,
} from "../../src/services/core/auth-service";
import {
  EnvironmentVariableError,
  SecretStoreAccessError,
} from "../../src/lib/errors";

// Mock process.env to prevent interference with actual environment variables
const originalEnv = process.env;

// Mock environment
const mockEnv = {
  JWT_SECRET: "test-jwt-secret",
  Chat: {} as DurableObjectNamespace,
  FILE_BUCKET: {} as any,
  DB: {} as any,
  VECTORIZE: {} as any,
  AI: {} as any,
  UserFileTracker: {} as DurableObjectNamespace,
  UploadSession: {} as DurableObjectNamespace,
  ASSETS: {} as any,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
};

// Mock environment with Cloudflare secrets store
const mockCloudflareEnv = {
  JWT_SECRET: {
    get: vi.fn().mockResolvedValue("cloudflare-jwt-secret"),
  },
  Chat: {} as DurableObjectNamespace,
  FILE_BUCKET: {} as any,
  DB: {} as any,
  VECTORIZE: {} as any,
  AI: {} as any,
  UserFileTracker: {} as DurableObjectNamespace,
  UploadSession: {} as DurableObjectNamespace,
  ASSETS: {} as any,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
};

// Mock environment without JWT secret
const mockNoJwtSecretEnv = {
  JWT_SECRET: undefined,
  Chat: {} as DurableObjectNamespace,
  FILE_BUCKET: {} as any,
  DB: {} as any,
  VECTORIZE: {} as any,
  AI: {} as any,
  UserFileTracker: {} as DurableObjectNamespace,
  UploadSession: {} as DurableObjectNamespace,
  ASSETS: {} as any,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
};

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear process.env to prevent interference with mock values
    process.env = {};
    authService = new AuthService(mockEnv);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getJwtSecret", () => {
    it("should return JWT secret from local environment", async () => {
      const secret = await authService.getJwtSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(secret)).toBe("test-jwt-secret");
    });

    it("should return JWT secret from Cloudflare secrets store", async () => {
      const cloudflareAuthService = new AuthService(mockCloudflareEnv);
      const secret = await cloudflareAuthService.getJwtSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(secret)).toBe("cloudflare-jwt-secret");
      expect(mockCloudflareEnv.JWT_SECRET.get).toHaveBeenCalled();
    });

    it("should throw when no JWT secret configured", async () => {
      const noJwtSecretAuthService = new AuthService(mockNoJwtSecretEnv);
      await expect(
        noJwtSecretAuthService.getJwtSecret()
      ).rejects.toBeInstanceOf(EnvironmentVariableError);
    });

    it("should surface Cloudflare secrets store errors", async () => {
      const errorEnv = {
        JWT_SECRET: {
          get: vi.fn().mockRejectedValue(new Error("Secrets store error")),
        },
        Chat: {} as DurableObjectNamespace,
        FILE_BUCKET: {} as any,
        DB: {} as any,
        VECTORIZE: {} as any,
        AI: {} as any,
        UserFileTracker: {} as DurableObjectNamespace,
        UploadSession: {} as DurableObjectNamespace,
        ASSETS: {} as any,
        FILE_PROCESSING_QUEUE: {} as any,
        FILE_PROCESSING_DLQ: {} as any,
      };
      const errorAuthService = new AuthService(errorEnv);
      await expect(errorAuthService.getJwtSecret()).rejects.toBeInstanceOf(
        SecretStoreAccessError
      );
    });
  });

  describe("authenticateUser", () => {
    it("should authenticate regular user successfully", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it("should set isAdmin when request indicates admin", async () => {
      const request: AuthRequest = {
        username: "adminuser",
        isAdmin: true,
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.error).toBeUndefined();

      // Verify the user is treated as admin
      const secret = await authService.getJwtSecret();
      const { payload } = await jwtVerify(response.token!, secret);
      expect(payload.isAdmin).toBe(true);
    });

    it("should reject user with empty username", async () => {
      const request: AuthRequest = {
        username: "",
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe("Username is required");
    });

    it("should reject user with whitespace-only username", async () => {
      const request: AuthRequest = {
        username: "   ",
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe("Username is required");
    });

    it("should reject user with undefined username", async () => {
      const request: AuthRequest = {
        username: undefined as any,
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe("Username is required");
    });

    it("should handle JWT creation errors gracefully", async () => {
      // Mock getJwtSecret to throw an error
      vi.spyOn(authService, "getJwtSecret").mockRejectedValue(
        new Error("Secret error")
      );

      const request: AuthRequest = {
        username: "testuser",
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe("Failed to create authentication token");
    });

    it("should work without admin secret", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };

      const response = await authService.authenticateUser(request);

      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
    });

    // OpenAI API keys are server-configured; user requests never include a key.
  });

  describe("extractAuthFromHeader", () => {
    it("should extract auth from valid Bearer token", async () => {
      // First create a valid token
      const request: AuthRequest = {
        username: "testuser",
      };
      const authResponse = await authService.authenticateUser(request);
      const token = authResponse.token!;

      const authHeader = `Bearer ${token}`;
      const payload = await authService.extractAuthFromHeader(authHeader);

      expect(payload).toBeDefined();
      expect(payload?.type).toBe("user-auth");
      expect(payload?.username).toBe("testuser");
      expect(payload?.isAdmin).toBe(false);
    });

    it("should return null for invalid token type", async () => {
      // Create a token with wrong type by mocking the JWT creation
      const mockToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoiaW52YWxpZCIsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJpYXQiOjE2MzQ1Njc4OTAsImV4cCI6MTYzNDY1NDI5MH0.invalid-signature";

      const authHeader = `Bearer ${mockToken}`;
      const payload = await authService.extractAuthFromHeader(authHeader);

      expect(payload).toBeNull();
    });

    it("should return null for malformed Authorization header", async () => {
      const payload = await authService.extractAuthFromHeader("InvalidHeader");
      expect(payload).toBeNull();
    });

    it("should return null for missing Authorization header", async () => {
      const payload = await authService.extractAuthFromHeader(null);
      expect(payload).toBeNull();
    });

    it("should return null for undefined Authorization header", async () => {
      const payload = await authService.extractAuthFromHeader(undefined);
      expect(payload).toBeNull();
    });

    it("should return null for non-Bearer token", async () => {
      const payload =
        await authService.extractAuthFromHeader("Basic dGVzdDp0ZXN0");
      expect(payload).toBeNull();
    });

    it("should handle JWT verification errors gracefully", async () => {
      const payload = await authService.extractAuthFromHeader(
        "Bearer invalid.token.here"
      );
      expect(payload).toBeNull();
    });
  });

  describe("static extractAuthFromHeader", () => {
    it("should extract auth using service factory", async () => {
      // First create a valid token
      const request: AuthRequest = {
        username: "testuser",
      };
      const authResponse = await authService.authenticateUser(request);
      const token = authResponse.token!;

      const authHeader = `Bearer ${token}`;
      const payload = await AuthService.extractAuthFromHeader(
        authHeader,
        mockEnv
      );

      expect(payload).toBeDefined();
      expect(payload?.username).toBe("testuser");
    });
  });

  describe("getUsernameFromHeader", () => {
    it("should extract username from valid token", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };
      const authResponse = await authService.authenticateUser(request);
      const token = authResponse.token!;

      const authHeader = `Bearer ${token}`;
      const username = await authService.getUsernameFromHeader(authHeader);

      expect(username).toBe("testuser");
    });

    it("should return null for invalid token", async () => {
      const username = await authService.getUsernameFromHeader(
        "Bearer invalid.token"
      );
      expect(username).toBeNull();
    });

    it("should return null for missing header", async () => {
      const username = await authService.getUsernameFromHeader(null);
      expect(username).toBeNull();
    });
  });

  describe("createAuthHeaders", () => {
    it("should create headers with JWT token", () => {
      const headers = AuthService.createAuthHeaders("test-jwt-token");

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("Bearer test-jwt-token");
    });

    it("should create headers without JWT token", () => {
      const headers = AuthService.createAuthHeaders();

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("");
    });

    it("should create headers with null JWT token", () => {
      const headers = AuthService.createAuthHeaders(null);

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("");
    });
  });

  describe("static createAuthHeaders", () => {
    it("should create headers with JWT token", () => {
      const headers = AuthService.createAuthHeaders("test-jwt-token");

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("Bearer test-jwt-token");
    });

    it("should create headers without JWT token", () => {
      const headers = AuthService.createAuthHeaders();

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("");
    });
  });

  describe("isJwtExpired", () => {
    it("should detect expired JWT", () => {
      // Create a token that expires in the past
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoidXNlci1hdXRoIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsImlhdCI6MTYzNDU2Nzg5MCwiZXhwIjoxNjM0NDgxNDkwfQ.invalid-signature";

      const isExpired = AuthService.isJwtExpired(expiredToken);
      expect(isExpired).toBe(true);
    });

    it("should detect valid JWT", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };
      const authResponse = await authService.authenticateUser(request);
      const token = authResponse.token!;

      const isExpired = AuthService.isJwtExpired(token);
      expect(isExpired).toBe(false);
    });

    it("should handle malformed JWT gracefully", () => {
      const isExpired = AuthService.isJwtExpired("invalid.jwt.token");
      expect(isExpired).toBe(true);
    });

    it("should handle empty JWT gracefully", () => {
      const isExpired = AuthService.isJwtExpired("");
      expect(isExpired).toBe(true);
    });
  });

  describe("static isJwtExpired", () => {
    it("should detect expired JWT", () => {
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoidXNlci1hdXRoIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsImlhdCI6MTYzNDU2Nzg5MCwiZXhwIjoxNjM0NDgxNDkwfQ.invalid-signature";

      const isExpired = AuthService.isJwtExpired(expiredToken);
      expect(isExpired).toBe(true);
    });

    it("should detect valid JWT", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };
      const authResponse = await authService.authenticateUser(request);
      const token = authResponse.token!;

      const isExpired = AuthService.isJwtExpired(token);
      expect(isExpired).toBe(false);
    });
  });

  describe("JWT token structure", () => {
    it("should create JWT with correct payload structure", async () => {
      const request: AuthRequest = {
        username: "testuser",
        isAdmin: true,
      };

      const response = await authService.authenticateUser(request);
      expect(response.success).toBe(true);

      const token = response.token!;
      const parts = token.split(".");
      expect(parts).toHaveLength(3); // Header, payload, signature

      // Decode payload
      const payload = JSON.parse(atob(parts[1]));
      expect(payload.type).toBe("user-auth");
      expect(payload.username).toBe("testuser");
      expect(payload.isAdmin).toBe(true);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it("should create JWT with 24-hour expiration", async () => {
      const request: AuthRequest = {
        username: "testuser",
      };

      const response = await authService.authenticateUser(request);
      expect(response.success).toBe(true);

      const token = response.token!;
      const parts = token.split(".");
      const payload = JSON.parse(atob(parts[1]));

      const now = Math.floor(Date.now() / 1000);
      const expiration = payload.exp;
      const timeDiff = expiration - now;

      // Should be approximately 24 hours (86400 seconds)
      expect(timeDiff).toBeGreaterThan(86300); // Allow 1 minute tolerance
      expect(timeDiff).toBeLessThan(86500);
    });
  });
});
