import { useCallback, useState } from "react";
import { useEvent, EVENT_TYPES } from "../lib/event-bus";
import type { CampaignEvent } from "../lib/event-bus";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { API_CONFIG } from "../shared";
import type { Campaign } from "../types/campaign";

// Type-safe helper functions
function isValidString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidJwt(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidUploadedFileInfo(
  value: { filename: string; fileKey: string } | null | undefined
): value is { filename: string; fileKey: string } {
  return (
    value !== null &&
    value !== undefined &&
    typeof value.filename === "string" &&
    typeof value.fileKey === "string" &&
    value.filename.trim().length > 0 &&
    value.fileKey.trim().length > 0
  );
}

interface UseCampaignManagementProps {
  isAuthenticated: boolean;
  onSendNotification?: (message: string) => void;
}

export function useCampaignManagement({
  isAuthenticated,
  onSendNotification,
}: UseCampaignManagementProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");

  const send = useEvent();

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setCampaignsLoading(true);
      setCampaignsError(null);

      const jwt = getStoredJwt();
      if (!isValidJwt(jwt)) {
        setCampaignsError("No authentication token available");
        return;
      }

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        { jwt }
      );

      if (!response.response.ok) {
        throw new Error(
          `Failed to fetch campaigns: ${response.response.status}`
        );
      }

      const data = (await response.response.json()) as {
        campaigns: Campaign[];
      };
      setCampaigns(data.campaigns || []);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      setCampaignsError(
        error instanceof Error ? error.message : "Failed to fetch campaigns"
      );
    } finally {
      setCampaignsLoading(false);
    }
  }, [isAuthenticated]);

  const handleCreateCampaign = useCallback(async () => {
    if (!isValidString(campaignName)) return;

    try {
      const jwt = getStoredJwt();
      if (!isValidJwt(jwt)) {
        console.error("No JWT token available");
        return;
      }

      console.log("Creating campaign:", {
        name: campaignName,
        description: campaignDescription,
      });

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            name: campaignName,
            description: campaignDescription,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.response.ok) {
        throw new Error(
          `Failed to create campaign: ${response.response.status}`
        );
      }

      const data = (await response.response.json()) as { campaign: Campaign };
      console.log("Campaign created successfully:", data);

      // Emit campaign created event
      send({
        type: EVENT_TYPES.CAMPAIGN.CREATED,
        campaignId: data.campaign.campaignId,
        campaignName: campaignName,
        source: "useCampaignManagement",
      } as CampaignEvent);

      // Reset form
      setCampaignName("");
      setCampaignDescription("");

      // Refresh campaigns list
      await fetchCampaigns();

      // Show success feedback
      console.log("Campaign created successfully!");
    } catch (error) {
      console.error("Failed to create campaign:", error);
    }
  }, [campaignName, campaignDescription, send, fetchCampaigns]);

  const handleAddFileToCampaign = useCallback(
    async (
      campaignId: string,
      uploadedFileInfo: { filename: string; fileKey: string } | null
    ) => {
      if (!isValidUploadedFileInfo(uploadedFileInfo)) return;

      try {
        const jwt = getStoredJwt();
        if (!isValidJwt(jwt)) {
          console.error("No JWT token available");
          return;
        }

        console.log("Adding file to campaign:", {
          campaignId,
          fileKey: uploadedFileInfo.fileKey,
          filename: uploadedFileInfo.filename,
        });

        const response = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              type: "file",
              id: uploadedFileInfo.fileKey,
              name: uploadedFileInfo.filename,
            }),
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.response.ok) {
          const errorText = await response.response.text();
          throw new Error(`Failed to add file to campaign: ${errorText}`);
        }

        const result = (await response.response.json()) as {
          message?: string;
          shards?: {
            count: number;
            campaignId: string;
            resourceId: string;
            message: string;
          };
          [key: string]: unknown;
        };
        console.log("File added to campaign successfully:", result);

        // Send appropriate notification based on the result
        if (onSendNotification) {
          // Get campaign ID from the response for context
          const campaignId = result.shards?.campaignId;
          const campaignContext = campaignId
            ? ` (Campaign ID: ${campaignId})`
            : "";

          if (result.message?.includes("already exists")) {
            onSendNotification(
              `"${uploadedFileInfo.filename}" was already in your campaign. No new shards were generated.${campaignContext}`
            );
          } else if (
            result.message?.includes("Generated") &&
            result.message.includes("shards")
          ) {
            // Extract the number of shards from the message
            const shardMatch = result.message.match(/Generated (\d+) shards/);
            const shardCount = shardMatch ? shardMatch[1] : "some";
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign and ${shardCount} shards were generated. Please show me these shards so I can review and approve them.${campaignContext}`
            );
          } else if (result.message?.includes("No shards were generated")) {
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign. No shards were generated from this resource.${campaignContext}`
            );
          } else {
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign. The document is now being processed to extract game-ready content.${campaignContext}`
            );
          }
        }
      } catch (error) {
        console.error("Failed to add file to campaign:", error);
      }
    },
    [onSendNotification]
  );

  const handleCreateCampaignForFile = useCallback(
    async (uploadedFileInfo: { filename: string; fileKey: string } | null) => {
      if (
        !isValidString(campaignName) ||
        !isValidUploadedFileInfo(uploadedFileInfo)
      )
        return;

      try {
        const jwt = getStoredJwt();
        if (!isValidJwt(jwt)) {
          console.error("No JWT token available");
          return;
        }

        // First create the campaign
        const createResponse = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              name: campaignName,
              description: campaignDescription,
            }),
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!createResponse.response.ok) {
          const errorText = await createResponse.response.text();
          throw new Error(`Failed to create campaign: ${errorText}`);
        }

        const result = (await createResponse.response.json()) as {
          campaign: Campaign;
        };
        const newCampaign = result.campaign;

        // Emit campaign created event
        send({
          type: EVENT_TYPES.CAMPAIGN.CREATED,
          campaignId: newCampaign.campaignId,
          campaignName: campaignName,
          source: "useCampaignManagement",
        } as CampaignEvent);

        // Then add the file to the new campaign
        await handleAddFileToCampaign(newCampaign.campaignId, uploadedFileInfo);

        // Reset form
        setCampaignName("");
        setCampaignDescription("");

        // Refresh campaigns list
        await fetchCampaigns();
      } catch (error) {
        console.error("Failed to create campaign for file:", error);
      }
    },
    [
      campaignName,
      campaignDescription,
      send,
      fetchCampaigns,
      handleAddFileToCampaign,
    ]
  );

  const handleDeleteCampaign = useCallback(
    async (campaignId: string) => {
      try {
        const jwt = getStoredJwt();
        if (!isValidJwt(jwt)) {
          console.error("No JWT token available");
          return;
        }

        console.log("Deleting campaign:", campaignId);

        const response = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.DELETE(campaignId)
          ),
          {
            method: "DELETE",
            jwt,
          }
        );

        if (!response.response.ok) {
          const errorText = await response.response.text();
          throw new Error(`Failed to delete campaign: ${errorText}`);
        }

        console.log("Campaign deleted successfully");

        // Refresh campaigns list
        await fetchCampaigns();

        // Show success feedback
        if (onSendNotification) {
          onSendNotification("Campaign deleted successfully");
        }
      } catch (error) {
        console.error("Failed to delete campaign:", error);
        if (onSendNotification) {
          onSendNotification(
            `Failed to delete campaign: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
        throw error;
      }
    },
    [fetchCampaigns, onSendNotification]
  );

  const handleUpdateCampaign = useCallback(
    async (
      campaignId: string,
      updates: { name: string; description: string }
    ) => {
      try {
        const jwt = getStoredJwt();
        if (!isValidJwt(jwt)) {
          console.error("No JWT token available");
          return;
        }

        console.log("Updating campaign:", { campaignId, updates });

        const response = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)
          ),
          {
            method: "PUT",
            jwt,
            body: JSON.stringify(updates),
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.response.ok) {
          const errorText = await response.response.text();
          throw new Error(`Failed to update campaign: ${errorText}`);
        }

        console.log("Campaign updated successfully");

        // Refresh campaigns list
        await fetchCampaigns();

        // Show success feedback
        if (onSendNotification) {
          onSendNotification("Campaign updated successfully");
        }
      } catch (error) {
        console.error("Failed to update campaign:", error);
        if (onSendNotification) {
          onSendNotification(
            `Failed to update campaign: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
        throw error;
      }
    },
    [fetchCampaigns, onSendNotification]
  );

  return {
    campaigns,
    campaignsLoading,
    campaignsError,
    campaignName,
    setCampaignName,
    campaignDescription,
    setCampaignDescription,
    fetchCampaigns,
    handleCreateCampaign,
    handleAddFileToCampaign,
    handleCreateCampaignForFile,
    handleDeleteCampaign,
    handleUpdateCampaign,
  };
}
