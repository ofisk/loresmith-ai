import { useCallback, useState } from "react";
import { useEventEmitter, EVENT_TYPES } from "../lib/event-bus";
import type { CampaignEvent } from "../lib/event-bus";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { API_CONFIG } from "../shared";
import type { Campaign } from "../types/campaign";

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

  const emit = useEventEmitter();

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setCampaignsLoading(true);
      setCampaignsError(null);

      const jwt = getStoredJwt();
      if (!jwt) {
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
    if (!campaignName.trim()) return;

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
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
      emit({
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
  }, [campaignName, campaignDescription, emit, fetchCampaigns]);

  const handleAddFileToCampaign = useCallback(
    async (
      campaignId: string,
      uploadedFileInfo: { filename: string; fileKey: string } | null
    ) => {
      if (!uploadedFileInfo) return;

      try {
        const jwt = getStoredJwt();
        if (!jwt) {
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

        const result = (await response.response.json()) as any;
        console.log("File added to campaign successfully:", result);

        // Send appropriate notification based on the result
        if (onSendNotification) {
          if (result.message?.includes("already exists")) {
            onSendNotification(
              `"${uploadedFileInfo.filename}" was already in your campaign. No new snippets were generated.`
            );
          } else if (
            result.message?.includes("Generated") &&
            result.message.includes("snippets")
          ) {
            // Extract the number of snippets from the message
            const snippetMatch = result.message.match(
              /Generated (\d+) snippets/
            );
            const snippetCount = snippetMatch ? snippetMatch[1] : "some";
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign and ${snippetCount} snippets were generated. Please show me these snippets so I can review and approve them.`
            );
          } else if (result.message?.includes("No snippets were generated")) {
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign. No snippets were generated from this resource.`
            );
          } else {
            onSendNotification(
              `"${uploadedFileInfo.filename}" has been added to my campaign. The document is now being processed to extract game-ready content.`
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
      if (!campaignName.trim() || !uploadedFileInfo) return;

      try {
        const jwt = getStoredJwt();
        if (!jwt) {
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
        emit({
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
      emit,
      fetchCampaigns,
      handleAddFileToCampaign,
    ]
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
  };
}
