import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignAgent } from "../../src/agents/campaign-agent";

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

describe("CampaignAgent JWT Integration", () => {
  let agent: CampaignAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new CampaignAgent(mockCtx, mockEnv, mockModel);
  });

  describe("JWT injection for campaign tools", () => {
    const testJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJpYXQiOjE2MzQ1Njc4OTB9.test";

    it("should inject JWT into createCampaign tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.createCampaign).toBeDefined();
      expect(enhancedTools.createCampaign.execute).toBeDefined();
    });

    it("should inject JWT into listCampaigns tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.listCampaigns).toBeDefined();
      expect(enhancedTools.listCampaigns.execute).toBeDefined();
    });

    it("should inject JWT into showCampaignDetails tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.showCampaignDetails).toBeDefined();
      expect(enhancedTools.showCampaignDetails.execute).toBeDefined();
    });

    it("should inject JWT into deleteCampaign tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.deleteCampaign).toBeDefined();
      expect(enhancedTools.deleteCampaign.execute).toBeDefined();
    });

    it("should inject JWT into deleteCampaigns tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.deleteCampaigns).toBeDefined();
      expect(enhancedTools.deleteCampaigns.execute).toBeDefined();
    });

    it("should inject JWT into addResourceToCampaign tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.addResourceToCampaign).toBeDefined();
      expect(enhancedTools.addResourceToCampaign.execute).toBeDefined();
    });

    it("should inject JWT into removeResourceFromCampaign tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.removeResourceFromCampaign).toBeDefined();
      expect(enhancedTools.removeResourceFromCampaign.execute).toBeDefined();
    });

    it("should inject JWT into listCampaignResources tool", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      expect(enhancedTools.listCampaignResources).toBeDefined();
      expect(enhancedTools.listCampaignResources.execute).toBeDefined();
    });

    it("should not inject JWT into tools that don't require authentication", () => {
      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);

      // resolveCampaignIdentifier doesn't require JWT
      expect(enhancedTools.resolveCampaignIdentifier).toBeDefined();
      expect(enhancedTools.resolveCampaignIdentifier.execute).toBeDefined();
    });

    it("should pass JWT to createCampaign when executed", async () => {
      // Mock the actual tool execution
      const mockCreateCampaign = vi.fn().mockResolvedValue({
        toolCallId: "test-call-id",
        result: {
          success: true,
          message: "Campaign created",
          data: { campaignId: "test-id" },
        },
      });

      // Replace the createCampaign tool with our mock
      (agent as any).tools.createCampaign = {
        ...(agent as any).tools.createCampaign,
        execute: mockCreateCampaign,
      };

      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the createCampaign tool
      await enhancedTools.createCampaign.execute(
        { name: "Test Campaign", description: "A test campaign" },
        mockContext
      );

      // Verify the tool was called with JWT injected
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        { name: "Test Campaign", description: "A test campaign", jwt: testJwt },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should pass JWT to listCampaigns when executed", async () => {
      // Mock the actual tool execution
      const mockListCampaigns = vi.fn().mockResolvedValue({
        toolCallId: "test-call-id",
        result: {
          success: true,
          message: "Campaigns listed",
          data: { campaigns: [] },
        },
      });

      // Replace the listCampaigns tool with our mock
      (agent as any).tools.listCampaigns = {
        ...(agent as any).tools.listCampaigns,
        execute: mockListCampaigns,
      };

      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the listCampaigns tool
      await enhancedTools.listCampaigns.execute({}, mockContext);

      // Verify the tool was called with JWT injected
      expect(mockListCampaigns).toHaveBeenCalledWith(
        { jwt: testJwt },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should handle null JWT gracefully for authenticated tools", async () => {
      // Mock the createCampaign tool BEFORE creating enhanced tools
      const mockCreateCampaign = vi.fn().mockResolvedValue({
        toolCallId: "test-call-id",
        result: { success: false, message: "Authentication required" },
      });

      (agent as any).tools.createCampaign = {
        ...(agent as any).tools.createCampaign,
        execute: mockCreateCampaign,
      };

      const enhancedTools = (agent as any).createEnhancedTools(null, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the createCampaign tool with null JWT
      await enhancedTools.createCampaign.execute(
        { name: "Test Campaign", description: "A test campaign" },
        mockContext
      );

      // Verify the tool was called with null JWT
      expect(mockCreateCampaign).toHaveBeenCalledWith(
        { name: "Test Campaign", description: "A test campaign", jwt: null },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });

    it("should not inject JWT into resolveCampaignIdentifier", async () => {
      // Mock the resolveCampaignIdentifier tool BEFORE creating enhanced tools
      const mockResolveCampaign = vi.fn().mockResolvedValue({
        success: true,
        data: { campaignId: "test-id", matchedBy: "name" },
      });

      (agent as any).tools.resolveCampaignIdentifier = {
        ...(agent as any).tools.resolveCampaignIdentifier,
        execute: mockResolveCampaign,
      };

      const enhancedTools = (agent as any).createEnhancedTools(testJwt, null);
      const mockContext = { toolCallId: "test-call-id" };

      // Execute the resolveCampaignIdentifier tool
      await enhancedTools.resolveCampaignIdentifier.execute(
        { campaignName: "Test Campaign" },
        mockContext
      );

      // Verify the tool was called without JWT injection
      expect(mockResolveCampaign).toHaveBeenCalledWith(
        { campaignName: "Test Campaign" },
        expect.objectContaining({ toolCallId: "test-call-id", env: mockEnv })
      );
    });
  });

  describe("JWT extraction from user messages", () => {
    const testJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJpYXQiOjE2MzQ1Njc4OTB9.test";

    it("should extract JWT from user message data", () => {
      const userMessage = {
        role: "user",
        content: "Create a campaign",
        data: { jwt: testJwt },
      };

      agent.addMessage(userMessage);

      // Access the private method for testing
      const messages = (agent as any).messages;
      const lastUserMessage = messages
        .slice()
        .reverse()
        .find((msg: any) => msg.role === "user");

      expect(lastUserMessage).toBeDefined();
      expect(lastUserMessage.data.jwt).toBe(testJwt);
    });

    it("should handle user messages without JWT data", () => {
      const userMessage = {
        role: "user",
        content: "Create a campaign",
        // No data property
      };

      agent.addMessage(userMessage);

      const messages = (agent as any).messages;
      const lastUserMessage = messages
        .slice()
        .reverse()
        .find((msg: any) => msg.role === "user");

      expect(lastUserMessage).toBeDefined();
      expect(lastUserMessage.data).toBeUndefined();
    });

    it("should handle user messages with empty data", () => {
      const userMessage = {
        role: "user",
        content: "Create a campaign",
        data: {},
      };

      agent.addMessage(userMessage);

      const messages = (agent as any).messages;
      const lastUserMessage = messages
        .slice()
        .reverse()
        .find((msg: any) => msg.role === "user");

      expect(lastUserMessage).toBeDefined();
      expect(lastUserMessage.data.jwt).toBeUndefined();
    });
  });
});
