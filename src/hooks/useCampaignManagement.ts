import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_TYPES } from "../constants/notification-types";
import type { CampaignEvent } from "../lib/event-bus";
import { EVENT_TYPES, useEvent } from "../lib/event-bus";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { API_CONFIG } from "../shared-config";
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
  campaigns?: Campaign[]; // Accept campaigns from parent instead of fetching
}

export function useCampaignManagement({
  isAuthenticated,
  campaigns: externalCampaigns = [],
}: UseCampaignManagementProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(externalCampaigns);
  const [campaignsLoading] = useState(false); // Always false since we don't fetch here
  const [campaignsError] = useState<string | null>(null); // Always null since we don't fetch here
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");

  // Sync external campaigns with local state
  useEffect(() => {
    setCampaigns(externalCampaigns);
  }, [externalCampaigns]);

  const send = useEvent();

  // Helper function to send notifications via SSE
  const sendNotification = useCallback(
    async (
      type: string,
      title: string,
      message: string,
      data?: Record<string, any>
    ) => {
      try {
        const jwt = getStoredJwt();
        if (!jwt) return;

        const payload = {
          type,
          title,
          message,
          data,
          timestamp: Date.now(),
        };

        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH),
          {
            method: "POST",
            jwt,
            body: JSON.stringify(payload),
          }
        );
      } catch (error) {
        console.error(
          "[useCampaignManagement] Failed to send notification:",
          error
        );
      }
    },
    []
  );

  // Removed fetchCampaigns - campaigns are now managed by parent component

  const handleCreateCampaign = useCallback(
    async (name?: string, description?: string) => {
      const campaignNameToUse = name || campaignName;
      const campaignDescriptionToUse = description || campaignDescription;

      if (!isValidString(campaignNameToUse)) {
        return;
      }

      try {
        const jwt = getStoredJwt();
        if (!isValidJwt(jwt)) {
          console.error("No JWT token available");
          return;
        }

        console.log("Creating campaign:", {
          name: campaignNameToUse,
          description: campaignDescriptionToUse,
        });

        const response = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              name: campaignNameToUse,
              description: campaignDescriptionToUse,
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
          campaignName: campaignNameToUse,
          source: "useCampaignManagement",
        } as CampaignEvent);

        // Reset form
        setCampaignName("");
        setCampaignDescription("");

        // Show success feedback
        console.log("Campaign created successfully!");
      } catch (error) {
        console.error("Failed to create campaign:", error);
      }
    },
    [campaignName, campaignDescription, send]
  );

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
        if (result.message?.includes("already exists")) {
          await sendNotification(
            NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED,
            "File Already in Campaign",
            `"${uploadedFileInfo.filename}" was already in your campaign. No new shards were generated.`,
            { fileName: uploadedFileInfo.filename, alreadyExists: true }
          );
        } else if (
          result.message?.includes("Generated") &&
          result.message.includes("shards")
        ) {
          // Extract the number of shards from the message
          const shardMatch = result.message.match(/Generated (\d+) shards/);
          const shardCount = shardMatch ? parseInt(shardMatch[1], 10) : 0;
          await sendNotification(
            NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED,
            "File Added with Shards",
            `"${uploadedFileInfo.filename}" has been added to your campaign and ${shardCount} shards were generated. Please show me these shards so I can review and approve them.`,
            { fileName: uploadedFileInfo.filename, shardCount }
          );
        } else if (result.message?.includes("No shards were generated")) {
          await sendNotification(
            NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED,
            "File Added to Campaign",
            `"${uploadedFileInfo.filename}" has been added to your campaign. No shards were generated from this resource.`,
            { fileName: uploadedFileInfo.filename, shardCount: 0 }
          );
        } else {
          await sendNotification(
            NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED,
            "File Added to Campaign",
            `"${uploadedFileInfo.filename}" has been added to your campaign. The document is now being processed to extract game-ready content.`,
            { fileName: uploadedFileInfo.filename }
          );
        }
      } catch (error) {
        console.error("Failed to add file to campaign:", error);
      }
    },
    [sendNotification]
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
      } catch (error) {
        console.error("Failed to create campaign for file:", error);
      }
    },
    [campaignName, campaignDescription, send, handleAddFileToCampaign]
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

        // Show success feedback
        await sendNotification(
          NOTIFICATION_TYPES.SUCCESS,
          "Campaign Deleted",
          "Campaign deleted successfully"
        );
      } catch (error) {
        console.error("Failed to delete campaign:", error);
        await sendNotification(
          NOTIFICATION_TYPES.ERROR,
          "Campaign Deletion Failed",
          `Failed to delete campaign: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        throw error;
      }
    },
    [sendNotification]
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

        // Show success feedback
        await sendNotification(
          NOTIFICATION_TYPES.SUCCESS,
          "Campaign Updated",
          "Campaign updated successfully"
        );
      } catch (error) {
        console.error("Failed to update campaign:", error);
        await sendNotification(
          NOTIFICATION_TYPES.ERROR,
          "Campaign Update Failed",
          `Failed to update campaign: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        throw error;
      }
    },
    [sendNotification]
  );

  return {
    campaigns,
    campaignsLoading,
    campaignsError,
    campaignName,
    setCampaignName,
    campaignDescription,
    setCampaignDescription,
    handleCreateCampaign,
    handleAddFileToCampaign,
    handleCreateCampaignForFile,
    handleDeleteCampaign,
    handleUpdateCampaign,
  };
}
