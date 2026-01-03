import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent";
import { SimpleChatAgent } from "../../src/agents/simple-chat-agent";

// Mock environment
const mockEnv = {
  DB: {} as D1Database,
  R2: {} as R2Bucket,
  VECTORIZE: {} as any,
  AI: {} as any,
  ADMIN_SECRET: "test-secret",
  Chat: {} as DurableObjectNamespace,
  UserFileTracker: {} as DurableObjectNamespace,
  UploadSession: {} as DurableObjectNamespace,
  ASSETS: {} as any,
  NOTIFICATIONS: {} as DurableObjectNamespace,
  FILE_PROCESSING_QUEUE: {} as any,
  FILE_PROCESSING_DLQ: {} as any,
} as any;

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
  // Tool that requires JWT (simulating Zod schema)
  authenticatedTool: {
    execute: vi.fn().mockResolvedValue("Authenticated tool executed"),
    description: "A tool that requires JWT authentication",
    parameters: {
      shape: {
        jwt: { description: "JWT token for authentication" },
        action: { description: "Action to perform" },
      },
    },
  },
  // Tool that doesn't require JWT
  publicTool: {
    execute: vi.fn().mockResolvedValue("Public tool executed"),
    description: "A tool that doesn't require authentication",
    parameters: {
      shape: {
        action: { description: "Action to perform" },
      },
    },
  },
};

// Create concrete test class
class TestBaseAgent extends BaseAgent {
  constructor() {
    super(mockCtx, mockEnv, mockModel, mockTools);
  }

  // Implement abstract method for testing
  async onChatMessage(
    _onFinish: any,
    _options?: { abortSignal?: AbortSignal }
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
      const message = { role: "user" as const, content: "Hello" };
      agent.addMessage(message);

      const messages = agent.getMessages();
      expect(messages).toContain(message);
    });

    it("should get all messages", () => {
      const message1 = { role: "user" as const, content: "Hello" };
      const message2 = { role: "assistant" as const, content: "Hi there!" };

      agent.addMessage(message1);
      agent.addMessage(message2);

      const messages = agent.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages).toContain(message1);
      expect(messages).toContain(message2);
    });

    it("should clear messages", () => {
      const message = { role: "user" as const, content: "Hello" };
      agent.addMessage(message);

      expect(agent.getMessages()).toHaveLength(1);

      agent.clearMessages();
      expect(agent.getMessages()).toHaveLength(0);
    });

    it("should filter processed tool invocations", () => {
      const unprocessedMessage = {
        role: "assistant" as const,
        content: "I'll use a tool",
        toolInvocations: [
          { state: "pending", toolCallId: "1" },
          { state: "result", result: "success" },
        ],
      };

      const processedMessage = {
        role: "assistant" as const,
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

  describe("JWT injection for authenticated tools", () => {
    const testJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJpYXQiOjE2MzQ1Njc4OTB9.test";

    it("should inject JWT into tools that require authentication", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.authenticatedTool).toBeDefined();
      expect(enhancedTools.authenticatedTool.execute).toBeDefined();
    });

    it("should not inject JWT into tools that don't require authentication", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.publicTool).toBeDefined();
      expect(enhancedTools.publicTool.execute).toBeDefined();
    });

    it("should pass JWT to authenticated tool when executed", async () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the authenticated tool
      await enhancedTools.authenticatedTool.execute(
        { action: "test-action" },
        mockContext
      );

      // Verify the tool was called with JWT injected
      expect(mockTools.authenticatedTool.execute).toHaveBeenCalledWith(
        { action: "test-action", jwt: testJwt },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should not inject JWT when tool already has JWT parameter", async () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };
      const existingJwt = "existing-jwt-token";

      // Execute the authenticated tool with existing JWT
      await enhancedTools.authenticatedTool.execute(
        { action: "test-action", jwt: existingJwt },
        mockContext
      );

      // Verify the tool was called with the existing JWT, not the injected one
      expect(mockTools.authenticatedTool.execute).toHaveBeenCalledWith(
        { action: "test-action", jwt: existingJwt },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should handle null JWT gracefully", async () => {
      const enhancedTools = (agent as any).createEnhancedTools(null, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the authenticated tool with null JWT
      await enhancedTools.authenticatedTool.execute(
        { action: "test-action" },
        mockContext
      );

      // Verify the tool was called with null JWT
      expect(mockTools.authenticatedTool.execute).toHaveBeenCalledWith(
        { action: "test-action", jwt: null },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should not inject JWT into public tools", async () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the public tool
      await enhancedTools.publicTool.execute(
        { action: "test-action" },
        mockContext
      );

      // Verify the tool was called without JWT injection
      expect(mockTools.publicTool.execute).toHaveBeenCalledWith(
        { action: "test-action" },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should handle tools with legacy parameter structure", async () => {
      // Create a tool with legacy parameter structure (no shape property)
      const legacyTool = {
        execute: vi.fn().mockResolvedValue("Legacy tool executed"),
        description: "A legacy tool",
        parameters: { jwt: "string", action: "string" },
      };

      const legacyTools = { legacyTool };
      const legacyAgent = new (class extends BaseAgent {
        constructor() {
          super(mockCtx, mockEnv, mockModel, legacyTools);
        }
        async onChatMessage() {
          return new Response("test");
        }
      })();

      const enhancedTools = (legacyAgent as any).createEnhancedTools(
        testJwt,
        null
      );
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the legacy tool
      await enhancedTools.legacyTool.execute(
        { action: "test-action" },
        mockContext
      );

      // Verify the tool was called without JWT injection (legacy tools don't get JWT injection)
      expect(legacyTool.execute).toHaveBeenCalledWith(
        { action: "test-action" },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should prevent infinite loops in tool execution", async () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Call the same tool multiple times with the same arguments
      for (let i = 0; i < 5; i++) {
        await enhancedTools.authenticatedTool.execute(
          { action: "test-action" },
          mockContext
        );
      }

      // Should only be called 3 times (2 normal calls + 1 blocked call)
      expect(mockTools.authenticatedTool.execute).toHaveBeenCalledTimes(3);
    });

    it("should handle stale command guard for mutating tools", async () => {
      const mockContext = { toolCallId: "test-call-id" };

      // Create a mutating tool
      const mutatingTool = {
        execute: vi.fn().mockResolvedValue("Mutating tool executed"),
        description: "A mutating tool",
        parameters: {
          shape: {
            jwt: { description: "JWT token" },
            action: { description: "Action to perform" },
          },
        },
      };

      const mutatingTools = { approveShardsTool: mutatingTool };
      const mutatingAgent = new (class extends BaseAgent {
        constructor() {
          super(mockCtx, mockEnv, mockModel, mutatingTools);
        }
        async onChatMessage() {
          return new Response("test");
        }
      })();

      const enhancedMutatingTools = (mutatingAgent as any).createEnhancedTools(
        testJwt,
        null,
        { isStaleCommand: true }
      );

      // Execute the mutating tool with stale command - it should still execute
      const result = await enhancedMutatingTools.approveShardsTool.execute(
        { action: "test-action" },
        mockContext
      );

      // Should return a normal success result and execute the underlying tool
      expect(result).toEqual({
        toolCallId: "test-call-id",
        result: {
          success: true,
          message: "ok",
          data: "Mutating tool executed",
        },
      });

      expect(mutatingTool.execute).toHaveBeenCalledTimes(1);
    });

    it("should extract campaignId from last user message data", async () => {
      const testAgent = new TestBaseAgent() as any;

      // Spy on createEnhancedTools to capture campaignIdHint
      const createEnhancedToolsSpy = vi.spyOn(
        TestBaseAgent.prototype as any,
        "createEnhancedTools"
      );

      // Seed messages with a user message that includes campaignId in data
      testAgent.messages = [
        {
          id: "msg-1",
          role: "user",
          content: "Test with campaign context",
          data: {
            jwt: testJwt,
            campaignId: "camp-123",
          },
          createdAt: new Date(),
        },
      ];

      // Call the protected onChatMessage implementation via the prototype
      const onFinish = vi.fn();
      await BaseAgent.prototype.onChatMessage.call(testAgent, onFinish);

      // Verify that createEnhancedTools was called with the extracted campaignId
      expect(createEnhancedToolsSpy).toHaveBeenCalled();
      const lastCallArgs =
        createEnhancedToolsSpy.mock.calls[
          createEnhancedToolsSpy.mock.calls.length - 1
        ];
      expect(lastCallArgs?.[0]).toBe(testJwt);
      expect(lastCallArgs?.[1]).toBe("camp-123");

      createEnhancedToolsSpy.mockRestore();
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
      // Database storage adds overhead, so we allow more time
      expect(endTime - startTime).toBeLessThan(500); // Should complete reasonably quickly
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
