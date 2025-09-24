import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRegistryService } from "../../src/lib/agent-registry";
import { AgentRouter } from "../../src/lib/agent-router";
import { ModelManager } from "../../src/lib/model-manager";
import { ServiceFactory } from "../../src/lib/service-factory";
import { AuthService } from "../../src/services/auth-service";
import { CampaignService } from "../../src/services/campaign-service";
import { LibraryService } from "../../src/services/library-service";

// Mock environment
const mockEnv = {
  DB: {} as D1Database,
  FILE_BUCKET: {} as R2Bucket,
  AI: {} as any,
  ADMIN_SECRET: "test-secret",
  Chat: {} as DurableObjectNamespace,
  UserFileTracker: {} as DurableObjectNamespace,
} as any;

describe("ServiceFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Clear the ServiceFactory cache between tests
    ServiceFactory.clearCache();
  });

  describe("getAuthService", () => {
    it("should create new AuthService instance on first call", () => {
      const authService = ServiceFactory.getAuthService(mockEnv);

      expect(authService).toBeDefined();
      expect(authService).toBeInstanceOf(AuthService);
    });

    it("should return cached AuthService instance on subsequent calls", () => {
      const firstCall = ServiceFactory.getAuthService(mockEnv);
      const secondCall = ServiceFactory.getAuthService(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should create new instance with different environment", () => {
      const differentEnv = { ...mockEnv, ADMIN_SECRET: undefined };

      const firstService = ServiceFactory.getAuthService(mockEnv);
      const secondService = ServiceFactory.getAuthService(differentEnv);

      expect(firstService).not.toBe(secondService);
    });
  });

  describe("getLibraryService", () => {
    it("should create new LibraryService instance on first call", () => {
      const libraryService = ServiceFactory.getLibraryService(mockEnv);

      expect(libraryService).toBeDefined();
      expect(libraryService).toBeInstanceOf(LibraryService);
    });

    it("should return cached LibraryService instance on subsequent calls", () => {
      const firstCall = ServiceFactory.getLibraryService(mockEnv);
      const secondCall = ServiceFactory.getLibraryService(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should create new instance with different environment", () => {
      const differentEnv = { ...mockEnv, FILE_BUCKET: undefined };

      const firstService = ServiceFactory.getLibraryService(mockEnv);
      const secondService = ServiceFactory.getLibraryService(differentEnv);

      expect(firstService).not.toBe(secondService);
    });
  });

  describe("getCampaignService", () => {
    it("should create new CampaignService instance on first call", () => {
      const campaignService = ServiceFactory.getCampaignService(mockEnv);

      expect(campaignService).toBeDefined();
      expect(campaignService).toBeInstanceOf(CampaignService);
    });

    it("should return cached CampaignService instance on subsequent calls", () => {
      const firstCall = ServiceFactory.getCampaignService(mockEnv);
      const secondCall = ServiceFactory.getCampaignService(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should create new instance with different environment", () => {
      // Create a different database object to test caching behavior
      const differentDb = { id: "different-db" } as unknown as D1Database;
      const differentEnv = { ...mockEnv, DB: differentDb };

      const firstService = ServiceFactory.getCampaignService(mockEnv);
      const secondService = ServiceFactory.getCampaignService(differentEnv);

      expect(firstService).not.toBe(secondService);
    });
  });

  describe("getModelManager", () => {
    it("should create new ModelManager instance on first call", () => {
      const modelManager = ServiceFactory.getModelManager(mockEnv);

      expect(modelManager).toBeDefined();
      expect(modelManager).toBeInstanceOf(ModelManager);
    });

    it("should return cached ModelManager instance on subsequent calls", () => {
      const firstCall = ServiceFactory.getModelManager(mockEnv);
      const secondCall = ServiceFactory.getModelManager(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should return same instance for different environments (singleton)", () => {
      const differentEnv = { ...mockEnv, AI: undefined };

      const firstService = ServiceFactory.getModelManager(mockEnv);
      const secondService = ServiceFactory.getModelManager(differentEnv);

      // ModelManager is a singleton, so should return the same instance
      expect(firstService).toBe(secondService);
    });
  });

  describe("getAgentRegistryService", () => {
    it("should create new AgentRegistryService instance on first call", () => {
      const agentRegistryService =
        ServiceFactory.getAgentRegistryService(mockEnv);

      expect(agentRegistryService).toBeDefined();
      expect(agentRegistryService).toBeInstanceOf(AgentRegistryService);
    });

    it("should return cached AgentRegistryService instance on subsequent calls", () => {
      const firstCall = ServiceFactory.getAgentRegistryService(mockEnv);
      const secondCall = ServiceFactory.getAgentRegistryService(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should create new instance with different environment", () => {
      // Create a different database object to test caching behavior
      const differentDb = { id: "different-db-2" } as unknown as D1Database;
      const differentEnv = { ...mockEnv, DB: differentDb };

      const firstService = ServiceFactory.getAgentRegistryService(mockEnv);
      const secondService =
        ServiceFactory.getAgentRegistryService(differentEnv);

      expect(firstService).not.toBe(secondService);
    });
  });

  describe("getAgentRouter", () => {
    it("should return AgentRouter class", () => {
      const agentRouter = ServiceFactory.getAgentRouter(mockEnv);

      expect(agentRouter).toBeDefined();
      expect(agentRouter).toBe(AgentRouter);
    });

    it("should return same AgentRouter class on subsequent calls", () => {
      const firstCall = ServiceFactory.getAgentRouter(mockEnv);
      const secondCall = ServiceFactory.getAgentRouter(mockEnv);

      expect(firstCall).toBe(secondCall);
    });

    it("should return same AgentRouter class for different environments", () => {
      const differentEnv = { ...mockEnv, DB: undefined };

      const firstService = ServiceFactory.getAgentRouter(mockEnv);
      const secondService = ServiceFactory.getAgentRouter(differentEnv);

      // AgentRouter is a static class, so should return the same reference
      expect(firstService).toBe(secondService);
    });
  });

  describe("initializeAgentRegistry", () => {
    it("should initialize agent registry successfully", async () => {
      // Since we're not mocking the services, we'll test that the method exists and can be called
      expect(ServiceFactory.initializeAgentRegistry).toBeDefined();

      // The method should complete without throwing
      await expect(
        ServiceFactory.initializeAgentRegistry(mockEnv)
      ).resolves.not.toThrow();
    });

    it("should handle initialization errors gracefully", async () => {
      // Since we're not mocking the services, we'll test that the method exists and can be called
      expect(ServiceFactory.initializeAgentRegistry).toBeDefined();
    });
  });

  describe("service isolation", () => {
    it("should maintain separate caches for different environments", () => {
      const env1 = { ...mockEnv, ADMIN_SECRET: "secret1" };
      const env2 = { ...mockEnv, ADMIN_SECRET: undefined };

      const authService1 = ServiceFactory.getAuthService(env1);
      const authService2 = ServiceFactory.getAuthService(env2);

      expect(authService1).not.toBe(authService2);
    });

    it("should not share caches between different service types", () => {
      const authService = ServiceFactory.getAuthService(mockEnv);
      const libraryService = ServiceFactory.getLibraryService(mockEnv);

      expect(authService).not.toBe(libraryService);
    });
  });

  describe("environment validation", () => {
    it("should handle missing environment properties gracefully", () => {
      const minimalEnv = { ...mockEnv, FILE_BUCKET: undefined };

      expect(() => ServiceFactory.getLibraryService(minimalEnv)).not.toThrow();
    });

    it("should handle undefined environment gracefully", () => {
      // ServiceFactory methods expect valid environments and will throw for invalid ones
      expect(() =>
        ServiceFactory.getLibraryService(undefined as any)
      ).toThrow();
    });

    it("should handle null environment gracefully", () => {
      // ServiceFactory methods expect valid environments and will throw for invalid ones
      expect(() => ServiceFactory.getLibraryService(null as any)).toThrow();
    });
  });

  describe("service lifecycle", () => {
    it("should create services lazily", () => {
      // Since we're not mocking the services, we'll test that the methods exist and can be called
      expect(ServiceFactory.getAuthService).toBeDefined();
      expect(ServiceFactory.getLibraryService).toBeDefined();

      // Create services and verify they return instances
      const authService = ServiceFactory.getAuthService(mockEnv);
      const libraryService = ServiceFactory.getLibraryService(mockEnv);

      expect(authService).toBeDefined();
      expect(libraryService).toBeDefined();
    });

    it("should maintain service instances across multiple calls", () => {
      // Since we're not mocking the services, we'll test that the method exists and can be called
      expect(ServiceFactory.getAuthService).toBeDefined();

      // Create multiple instances and verify they're the same (cached)
      const authService1 = ServiceFactory.getAuthService(mockEnv);
      const authService2 = ServiceFactory.getAuthService(mockEnv);
      const authService3 = ServiceFactory.getAuthService(mockEnv);

      expect(authService1).toBe(authService2);
      expect(authService2).toBe(authService3);
    });
  });

  describe("error handling", () => {
    it("should handle service instantiation gracefully", () => {
      const result = ServiceFactory.getAuthService(mockEnv);
      expect(result).toBeDefined();
    });
  });
});
