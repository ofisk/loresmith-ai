import { getCurrentAgent } from "agents";
import { tool } from "ai";
import { z } from "zod";
import type { BaseAgent } from "../agents/base-agent";

// Campaign Durable Object tool definitions

const listCampaigns = tool({
  description: "List all campaigns using Durable Object storage",
  parameters: z.object({}),
  execute: async (): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // List campaigns using the Durable Object
      const response = await campaignManager.fetch("https://dummy/campaigns", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Failed to list campaigns: ${response.status}`);
      }

      const result = await response.json();
      const campaigns = result.campaigns || [];

      if (campaigns.length === 0) {
        return "No campaigns found.";
      }

      const campaignList = campaigns
        .map((c: any) => `- ${c.name} (ID: ${c.campaignId})`)
        .join("\n");
      return `Found ${campaigns.length} campaign(s):\n${campaignList}`;
    } catch (error) {
      console.error("Error listing campaigns:", error);
      return `Error listing campaigns: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const createCampaign = tool({
  description:
    "Create a new campaign with the specified name using Durable Object storage",
  parameters: z.object({
    name: z.string().describe("The name of the campaign to create"),
  }),
  execute: async ({ name }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // Create the campaign using the Durable Object
      const response = await campaignManager.fetch("https://dummy/campaigns", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create campaign: ${response.status}`);
      }

      const result = await response.json();
      return `Campaign "${name}" created successfully with ID: ${result.campaign.campaignId}`;
    } catch (error) {
      console.error("Error creating campaign:", error);
      return `Error creating campaign: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const showCampaignDetails = tool({
  description:
    "Get detailed information about a specific campaign using Durable Object storage",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to get details for"),
  }),
  execute: async ({ campaignId }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // Get campaign details using the Durable Object
      const response = await campaignManager.fetch(
        `https://dummy/campaigns/${campaignId}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get campaign details: ${response.status}`);
      }

      const result = await response.json();
      const campaign = result.campaign;

      return `Campaign Details:\n- Name: ${campaign.name}\n- ID: ${campaign.campaignId}\n- Created: ${campaign.createdAt}\n- Updated: ${campaign.updatedAt}\n- Resources: ${campaign.resources?.length || 0} items`;
    } catch (error) {
      console.error("Error getting campaign details:", error);
      return `Error getting campaign details: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const addResourceToCampaign = tool({
  description: "Add a resource to a campaign using Durable Object storage",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to add the resource to"),
    resourceType: z
      .string()
      .describe("The type of resource (pdf, document, image, video, audio)"),
    resourceId: z.string().describe("The ID of the resource"),
    resourceName: z.string().describe("The name of the resource"),
  }),
  execute: async ({
    campaignId,
    resourceType,
    resourceId,
    resourceName,
  }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // Add resource using the Durable Object
      const response = await campaignManager.fetch(
        `https://dummy/campaigns/${campaignId}/resource`,
        {
          method: "POST",
          body: JSON.stringify({
            type: resourceType,
            id: resourceId,
            name: resourceName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to add resource: ${response.status}`);
      }

      const result = await response.json();
      return `Resource "${resourceName}" (${resourceType}) added successfully to campaign ${campaignId}. Total resources: ${result.resources?.length || 0}`;
    } catch (error) {
      console.error("Error adding resource:", error);
      return `Error adding resource: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const listCampaignResources = tool({
  description: "List all resources in a campaign using Durable Object storage",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to list resources for"),
  }),
  execute: async ({ campaignId }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // List resources using the Durable Object
      const response = await campaignManager.fetch(
        `https://dummy/campaigns/${campaignId}/resources`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to list campaign resources: ${response.status}`
        );
      }

      const result = await response.json();
      const resources = result.resources || [];

      if (resources.length === 0) {
        return `No resources found in campaign ${campaignId}.`;
      }

      const resourceList = resources
        .map((r: any) => `- ${r.name} (${r.type})`)
        .join("\n");
      return `Found ${resources.length} resource(s) in campaign ${campaignId}:\n${resourceList}`;
    } catch (error) {
      console.error("Error listing campaign resources:", error);
      return `Error listing campaign resources: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const deleteCampaign = tool({
  description: "Delete a campaign using Durable Object storage",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to delete"),
  }),
  execute: async ({ campaignId }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // Delete campaign using the Durable Object
      const response = await campaignManager.fetch(
        `https://dummy/campaigns/${campaignId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete campaign: ${response.status}`);
      }

      return `Campaign ${campaignId} deleted successfully.`;
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return `Error deleting campaign: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const deleteCampaigns = tool({
  description: "Delete multiple campaigns using Durable Object storage",
  parameters: z.object({
    campaignIds: z
      .array(z.string())
      .describe("Array of campaign IDs to delete"),
  }),
  execute: async ({ campaignIds }): Promise<string> => {
    try {
      const { agent } = getCurrentAgent<BaseAgent>();
      const env = (agent as any).env;

      // Get the CampaignManager Durable Object for this user
      const userId = "default"; // You can extract this from JWT or context
      const id = env.CampaignManager.idFromName(userId);
      const campaignManager = env.CampaignManager.get(id);

      // Delete campaigns using the Durable Object
      const response = await campaignManager.fetch("https://dummy/campaigns", {
        method: "DELETE",
        body: JSON.stringify({ campaignIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete campaigns: ${response.status}`);
      }

      return `Successfully deleted ${campaignIds.length} campaign(s): ${campaignIds.join(", ")}`;
    } catch (error) {
      console.error("Error deleting campaigns:", error);
      return `Error deleting campaigns: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

export const campaignTools = {
  listCampaigns,
  createCampaign,
  showCampaignDetails,
  addResourceToCampaign,
  listCampaignResources,
  deleteCampaign,
  deleteCampaigns,
};
