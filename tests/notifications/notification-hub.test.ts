import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationHub } from "../../src/durable-objects/notification-hub";

// Mock the Cloudflare DurableObject base to avoid constructor state checks in Node
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: DurableObjectState;
    constructor(ctx: DurableObjectState, _env: any) {
      this.ctx = ctx;
    }
  },
}));

// Mock Durable Object environment (unused, keep underscore to satisfy linter)
const _mockEnv = {
  NOTIFICATIONS: {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (_id: any) =>
      new NotificationHub({} as unknown as DurableObjectState, {} as any),
  },
} as any;

describe("NotificationHub", () => {
  let notificationHub: NotificationHub;
  let mockStorage: Map<string, any>;
  let mockState: DurableObjectState;

  beforeEach(() => {
    mockStorage = new Map();
    mockState = {
      storage: {
        get: vi.fn((key: string) => Promise.resolve(mockStorage.get(key))),
        put: vi.fn((key: string, value: any) => {
          mockStorage.set(key, value);
          return Promise.resolve();
        }),
        delete: vi.fn((key: string | string[]) => {
          if (Array.isArray(key)) {
            for (const k of key) {
              mockStorage.delete(k);
            }
          } else {
            mockStorage.delete(key);
          }
          return Promise.resolve();
        }),
        list: vi.fn((options?: { prefix?: string }) => {
          const entries: Array<[string, any]> = [];
          const prefix = options?.prefix || "";
          for (const [key, value] of mockStorage.entries()) {
            if (key.startsWith(prefix)) {
              entries.push([key, value]);
            }
          }
          return Promise.resolve(entries);
        }),
      },
      waitUntil: vi.fn(),
      blockConcurrencyWhile: vi.fn(),
    } as unknown as DurableObjectState;

    notificationHub = new NotificationHub(mockState, {} as any);
  });

  afterEach(() => {
    notificationHub.destroy();
  });

  it("should create a NotificationHub instance", () => {
    expect(notificationHub).toBeInstanceOf(NotificationHub);
  });

  it("should start with no subscribers", () => {
    expect(notificationHub.getSubscriberCount()).toBe(0);
  });

  it("should handle subscribe request", async () => {
    const request = new Request("http://localhost/subscribe?userId=test-user");
    const response = await notificationHub.fetch(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("should handle publish request", async () => {
    const payload = {
      type: "test",
      title: "Test Notification",
      message: "This is a test notification",
    };

    const request = new Request("http://localhost/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await notificationHub.fetch(request);

    expect(response.status).toBe(200);
    const result = (await response.json()) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it("should reject invalid publish request", async () => {
    const request = new Request("http://localhost/publish", {
      method: "GET", // Wrong method
    });

    const response = await notificationHub.fetch(request);

    expect(response.status).toBe(405);
  });

  it("should reject publish request with invalid JSON", async () => {
    const request = new Request("http://localhost/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });

    const response = await notificationHub.fetch(request);

    expect(response.status).toBe(400);
  });

  it("should return 404 for unknown endpoints", async () => {
    const request = new Request("http://localhost/unknown");
    const response = await notificationHub.fetch(request);

    expect(response.status).toBe(404);
  });
});
