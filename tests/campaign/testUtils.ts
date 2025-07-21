import { vi } from "vitest";
import type { CampaignData, CampaignResource } from "../../src/types/campaign";

// Define proper types for the environment and stubs
type CampaignManagerStub = {
  fetch: ReturnType<typeof vi.fn>;
};

type D1DatabaseStub = {
  prepare: ReturnType<typeof vi.fn>;
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
  DB?: D1DatabaseStub;
  ADMIN_SECRET?: string;
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
    fetch: vi.fn(async (url, _options) => {
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
 * Create a mock D1 database stub
 */
export function createD1DatabaseStub(
  campaigns: any[] = [],
  operationSuccess = true
): D1DatabaseStub {
  return {
    prepare: vi.fn((_query: string) => {
      const mockStmt = {
        bind: vi.fn(() => mockStmt),
        all: vi.fn(async () => ({ results: campaigns })),
        first: vi.fn(async () => campaigns[0] || null),
        run: vi.fn(async () => ({
          meta: { changes: operationSuccess ? 1 : 0 },
        })),
      };
      return mockStmt;
    }),
  };
}

/**
 * Helper to create a test environment with campaign manager and D1 database
 */
export function createTestEnv(
  campaigns: CampaignData[] = [],
  campaign?: CampaignData,
  operationSuccess = true
): Env {
  // Convert campaigns to D1 format
  const d1Campaigns = campaigns.map((c) => ({
    id: c.campaignId,
    username: "demo-user",
    name: c.name,
    description: null,
    status: "active",
    metadata: JSON.stringify({}),
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));

  // Add individual campaign if provided
  if (campaign) {
    d1Campaigns.unshift({
      id: campaign.campaignId,
      username: "demo-user",
      name: campaign.name,
      description: null,
      status: "active",
      metadata: JSON.stringify({}),
      created_at: campaign.createdAt,
      updated_at: campaign.updatedAt,
    });
  }

  return {
    CampaignManager: {
      idFromName: vi.fn((name: string) => ({ toString: () => name })),
      get: vi.fn(() =>
        createCampaignManagerStub(campaigns, campaign, operationSuccess)
      ),
    },
    DB: createD1DatabaseStub(d1Campaigns, operationSuccess),
    ADMIN_SECRET: "test-admin-secret",
  };
}
