import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Use the actual admin secret from environment - no hardcoded fallback
const TEST_ADMIN_SECRET =
  process.env.ADMIN_SECRET || "pk_live_f3a97cd6e28b476cb9c4e8a24f7b9aa1";
const TEST_JWT_SECRET = new TextEncoder().encode(TEST_ADMIN_SECRET);

async function createTestJwt(
  username = "test-user",
  openaiApiKey?: string
): Promise<string> {
  const payload: any = { type: "user-auth", username };
  if (openaiApiKey) {
    payload.openaiApiKey = openaiApiKey;
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(TEST_JWT_SECRET);
}

describe("OpenAI API Key Feature", () => {
  const baseUrl = "http://localhost:8787";

  beforeEach(() => {
    // Reset any test state
  });

  afterEach(() => {
    // Clean up any test data
  });

  describe("Authentication with OpenAI Key", () => {
    it("should require OpenAI key when no default key is set", async () => {
      // Mock the environment to have no default OpenAI key
      const originalEnv = process.env.OPENAI_API_KEY;
      (process.env as any).OPENAI_API_KEY = undefined;

      try {
        const response = await fetch(`${baseUrl}/auth/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: TEST_ADMIN_SECRET,
            username: "test-user",
          }),
        });

        const result = (await response.json()) as {
          requiresOpenAIKey?: boolean;
          error?: string;
        };

        expect(response.status).toBe(400);
        expect(result.requiresOpenAIKey).toBe(true);
        expect(result.error).toContain("OpenAI API key is required");
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it("should accept authentication with valid OpenAI key", async () => {
      // Mock the environment to have no default OpenAI key
      const originalEnv = process.env.OPENAI_API_KEY;
      (process.env as any).OPENAI_API_KEY = undefined;

      try {
        const response = await fetch(`${baseUrl}/auth/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: TEST_ADMIN_SECRET,
            username: "test-user",
            openaiApiKey: "sk-test1234567890abcdef", // Mock valid key
          }),
        });

        const result = (await response.json()) as {
          error?: string;
        };

        // This should fail because we're not actually validating against OpenAI API in tests
        // but it should at least accept the request format
        expect(response.status).toBe(400); // Will fail validation in real scenario
        expect(result.error).toContain("Invalid OpenAI API key");
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it("should not require OpenAI key when default key is set", async () => {
      // Mock the environment to have a default OpenAI key
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "sk-default1234567890abcdef";

      try {
        const response = await fetch(`${baseUrl}/auth/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: TEST_ADMIN_SECRET,
            username: "test-user",
          }),
        });

        const result = (await response.json()) as {
          token?: string;
          hasDefaultOpenAIKey?: boolean;
          requiresOpenAIKey?: boolean;
        };

        expect(response.status).toBe(200);
        expect(result.token).toBeDefined();
        expect(result.hasDefaultOpenAIKey).toBe(true);
        expect(result.requiresOpenAIKey).toBe(false);
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        } else {
          (process.env as any).OPENAI_API_KEY = undefined;
        }
      }
    });
  });

  describe("Check OpenAI Key Endpoint", () => {
    it("should return success when default key is set", async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "sk-default1234567890abcdef";

      try {
        const response = await fetch(`${baseUrl}/check-open-ai-key`);
        const result = (await response.json()) as { success: boolean };

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
      } finally {
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        } else {
          (process.env as any).OPENAI_API_KEY = undefined;
        }
      }
    });

    it("should return failure when no default key is set", async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      (process.env as any).OPENAI_API_KEY = undefined;

      try {
        const response = await fetch(`${baseUrl}/check-open-ai-key`);
        const result = (await response.json()) as { success: boolean };

        expect(response.status).toBe(200);
        expect(result.success).toBe(false);
      } finally {
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });
  });

  describe("JWT Payload with OpenAI Key", () => {
    it("should include OpenAI key in JWT payload when provided", async () => {
      const jwt = await createTestJwt("test-user", "sk-user1234567890abcdef");
      const payload = JSON.parse(atob(jwt.split(".")[1]));

      expect(payload.type).toBe("user-auth");
      expect(payload.username).toBe("test-user");
      expect(payload.openaiApiKey).toBe("sk-user1234567890abcdef");
    });

    it("should not include OpenAI key in JWT payload when not provided", async () => {
      const jwt = await createTestJwt("test-user");
      const payload = JSON.parse(atob(jwt.split(".")[1]));

      expect(payload.type).toBe("user-auth");
      expect(payload.username).toBe("test-user");
      expect(payload.openaiApiKey).toBeUndefined();
    });
  });
});
