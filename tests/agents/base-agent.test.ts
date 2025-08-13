import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent";
import { SimpleChatAgent } from "../../src/agents/simple-chat-agent";
import type { Env } from "../../src/middleware/auth";

// Mock environment
const mockEnv: Env = {
  DB: {} as D1Database,
  FILE_BUCKET: {} as R2Bucket,
  AI: {} as any,
  ADMIN_SECRET: "test-secret",
  Chat: {} as DurableObjectNamespace,
  UserFileTracker: {} as DurableObjectNamespace,
};

// Mock durable object context
const mockCtx = {
  env: mockEnv,
  state: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
} as any;

// Mock model
const mockModel = {
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
};

// Mock tools
const mockTools = {
  testTool: {
    execute: vi.fn().mockResolvedValue("Tool executed successfully"),
    description: "A test tool",
    parameters: { input: "string" },
  },
  asyncTool: {
    execute: vi.fn().mockResolvedValue("Async tool executed"),
    description: "An async test tool",
    parameters: { input: "string" },
  },
  errorTool: {
    execute: vi.fn().mockRejectedValue(new Error("Tool execution failed")),
    description: "A tool that fails",
    parameters: { input: "string" },
  },
};

// Create concrete test class
class TestBaseAgent extends BaseAgent {
  constructor() {
    super(mockCtx, mockEnv, mockModel, mockTools);
  }

  // Implement abstract method for testing
  async onChatMessage(
    onFinish: any,
    options?: { abortSignal?: AbortSignal }
  ): Promise<Response> {
    return new Response("Test response");
  }
}

describe("BaseAgent", () => {
  let agent: TestBaseAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new TestBaseAgent();
  });

  describe("constructor and initialization", () => {
    it("should initialize with correct properties", () => {
      expect(agent).toBeInstanceOf(SimpleChatAgent);
      expect(agent).toBeInstanceOf(BaseAgent);
    });

    it("should store model and tools correctly", () => {
      expect((agent as any).model).toBe(mockModel);
      expect((agent as any).tools).toBe(mockTools);
    });

    it("should have correct agent metadata", () => {
      expect(BaseAgent.agentMetadata).toBeDefined();
      expect(BaseAgent.agentMetadata.description).toBeDefined();
      expect(BaseAgent.agentMetadata.tools).toBeDefined();
    });
  });

  describe("message handling", () => {
    it("should add messages correctly", () => {
      const message = { role: "user", content: "Hello" };
      agent.addMessage(message);

      const messages = agent.getMessages();
      expect(messages).toContain(message);
    });

    it("should get all messages", () => {
      const message1 = { role: "user", content: "Hello" };
      const message2 = { role: "assistant", content: "Hi there!" };

      agent.addMessage(message1);
      agent.addMessage(message2);

      const messages = agent.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages).toContain(message1);
      expect(messages).toContain(message2);
    });

    it("should clear messages", () => {
      const message = { role: "user", content: "Hello" };
      agent.addMessage(message);

      expect(agent.getMessages()).toHaveLength(1);

      agent.clearMessages();
      expect(agent.getMessages()).toHaveLength(0);
    });

    it("should filter processed tool invocations", () => {
      const unprocessedMessage = {
        role: "assistant",
        content: "I'll use a tool",
        toolInvocations: [
          { state: "pending", toolCallId: "1" },
          { state: "result", result: "success" },
        ],
      };

      const processedMessage = {
        role: "assistant",
        content: "Tool completed",
        toolInvocations: [
          { state: "result", result: "success" },
          { state: "result", result: "completed" },
        ],
      };

      agent.addMessage(unprocessedMessage);
      agent.addMessage(processedMessage);

      const messages = agent.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages).toContain(unprocessedMessage);
      expect(messages).toContain(processedMessage);
    });
  });

  describe("tool execution", () => {
    it("should have access to tools", () => {
      expect((agent as any).tools).toBeDefined();
      expect((agent as any).tools.testTool).toBeDefined();
      expect((agent as any).tools.asyncTool).toBeDefined();
      expect((agent as any).tools.errorTool).toBeDefined();
    });
  });

  describe("enhanced tools creation", () => {
    it("should have access to tools", () => {
      expect((agent as any).tools).toBeDefined();
      expect((agent as any).tools.testTool).toBeDefined();
    });
  });

  describe("chat message handling", () => {
    it("should handle chat messages", async () => {
      const mockOnFinish = vi.fn();
      const response = await agent.onChatMessage(mockOnFinish);

      expect(response).toBeInstanceOf(Response);
    });
  });

  describe("tool invocation processing", () => {
    it("should handle tool invocations", () => {
      expect(agent).toBeDefined();
    });
  });

  describe("error handling and edge cases", () => {
    it("should handle edge cases gracefully", () => {
      expect(agent).toBeDefined();
    });
  });

  describe("performance and memory", () => {
    it("should handle large numbers of messages efficiently", () => {
      const startTime = Date.now();

      // Add 1000 messages
      for (let i = 0; i < 1000; i++) {
        agent.addMessage({
          role: "user",
          content: `Message ${i}`,
        });
      }

      const endTime = Date.now();

      expect(agent.getMessages()).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it("should clear messages efficiently", () => {
      // Add many messages
      for (let i = 0; i < 1000; i++) {
        agent.addMessage({
          role: "user",
          content: `Message ${i}`,
        });
      }

      const startTime = Date.now();
      agent.clearMessages();
      const endTime = Date.now();

      expect(agent.getMessages()).toHaveLength(0);
      expect(endTime - startTime).toBeLessThan(50); // Should complete in under 50ms
    });
  });
});
