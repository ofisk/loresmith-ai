import { vi } from "vitest";
import type { CampaignData, CampaignResource } from "../../src/types/campaign";

// Define proper types for the environment and stubs
type CampaignManagerStub = {
  fetch: ReturnType<typeof vi.fn>;
};

type CampaignsKVStub = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

/**
 * Shared environment type for Campaign tests
 * Defines the structure of the environment object passed to the Hono app
 */
export type Env = {
  CampaignManager: {
    idFromName: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  CAMPAIGNS_KV?: CampaignsKVStub;
};

/**
 * Default stub for CampaignManager Durable Object for most tests.
 * Provides mock responses for campaign operations.
 *
 * @param campaigns - Array of campaign data to return for listing
 * @param campaign - Single campaign data to return for detail operations
 * @param operationSuccess - Whether operations should succeed
 * @returns Mock Durable Object stub with fetch method
 */
export function createCampaignManagerStub(
  campaigns: CampaignData[] = [],
  campaign?: CampaignData,
  operationSuccess = true
): CampaignManagerStub {
  return {
    fetch: vi.fn(async (url, options) => {
      // Campaign listing endpoint
      if (url.includes("list-campaigns")) {
        return {
          status: 200,
          json: async () => ({ campaigns }),
        };
      }
      
      // Campaign creation endpoint
      if (url.includes("create-campaign")) {
        if (!operationSuccess) {
          return {
            status: 500,
            json: async () => ({ error: "Failed to create campaign" }),
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            campaign: campaign || {
              campaignId: "test-campaign-id",
              name: "Test Campaign",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              resources: [],
            },
          }),
        };
      }
      
      // Campaign detail endpoint
      if (url.includes("get-campaign")) {
        if (!campaign) {
          return {
            status: 404,
            json: async () => ({ error: "Campaign not found" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ campaign }),
        };
      }
      
      // Add resource endpoint
      if (url.includes("add-resource")) {
        if (!operationSuccess) {
          return {
            status: 500,
            json: async () => ({ error: "Failed to add resource" }),
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            resources: campaign?.resources || [],
          }),
        };
      }
      
      // Remove resource endpoint
      if (url.includes("remove-resource")) {
        if (!operationSuccess) {
          return {
            status: 500,
            json: async () => ({ error: "Failed to remove resource" }),
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            resources: campaign?.resources || [],
          }),
        };
      }
      
      // Delete campaign endpoint
      if (url.includes("delete-campaign")) {
        if (!operationSuccess) {
          return {
            status: 500,
            json: async () => ({ error: "Failed to delete campaign" }),
          };
        }
        return {
          status: 200,
          json: async () => ({ success: true }),
        };
      }
      
      // Trigger indexing endpoint
      if (url.includes("trigger-indexing")) {
        if (!operationSuccess) {
          return {
            status: 500,
            json: async () => ({ error: "Failed to trigger indexing" }),
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            message: "Indexing triggered successfully",
          }),
        };
      }
      
      return { status: 404, json: async () => ({}) };
    }),
  };
}

/**
 * Create a mock campaign for testing
 */
export function createMockCampaign(
  overrides: Partial<CampaignData> = {}
): CampaignData {
  return {
    campaignId: "test-campaign-id",
    name: "Test Campaign",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resources: [],
    ...overrides,
  };
}

/**
 * Create a mock campaign resource for testing
 */
export function createMockResource(
  overrides: Partial<CampaignResource> = {}
): CampaignResource {
  return {
    type: "pdf",
    id: "test-resource-id",
    name: "Test Resource",
    ...overrides,
  };
}

/**
 * Create a mock campaigns KV stub
 */
export function createCampaignsKVStub(
  campaigns: Record<string, string> = {},
  operationSuccess = true
): CampaignsKVStub {
  return {
    get: vi.fn(async (key: string) => {
      if (!operationSuccess) {
        throw new Error("KV operation failed");
      }
      return campaigns[key] || null;
    }),
    put: vi.fn(async (key: string, value: string) => {
      if (!operationSuccess) {
        throw new Error("KV operation failed");
      }
      campaigns[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      if (!operationSuccess) {
        throw new Error("KV operation failed");
      }
      delete campaigns[key];
    }),
    list: vi.fn(async (options?: any) => {
      if (!operationSuccess) {
        throw new Error("KV operation failed");
      }
      return {
        keys: Object.keys(campaigns).map(key => ({ name: key })),
        list_complete: true,
        cursor: "",
      };
    }),
  };
}

/**
 * Helper to create a test environment with campaign manager and KV storage
 */
export function createTestEnv(
  campaigns: CampaignData[] = [],
  campaign?: CampaignData,
  operationSuccess = true
): Env {
  // Create KV storage with campaign data
  const kvData: Record<string, string> = {};
  
  // Add individual campaign if provided
  if (campaign) {
    const key = `user:demo-user:campaign:${campaign.campaignId}`;
    kvData[key] = JSON.stringify(campaign);
  }
  
  // Add all campaigns from the array
  campaigns.forEach(campaignData => {
    const key = `user:demo-user:campaign:${campaignData.campaignId}`;
    kvData[key] = JSON.stringify(campaignData);
  });
  
  return {
    CampaignManager: {
      idFromName: vi.fn((name: string) => ({ toString: () => name })),
      get: vi.fn(() => createCampaignManagerStub(campaigns, campaign, operationSuccess)),
    },
    CAMPAIGNS_KV: createCampaignsKVStub(kvData, operationSuccess),
  };
} 