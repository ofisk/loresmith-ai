import { useCallback, useState } from "react";
import { API_CONFIG } from "../shared-config";
import { authenticatedFetchWithExpiration } from "../services/auth-service";
import { NOTIFICATION_TYPES } from "../constants/notification-types";

export function useCampaignAddition() {
  // Campaign addition progress tracking
  const [campaignAdditionProgress, setCampaignAdditionProgress] = useState<
    Record<string, number>
  >({});
  const [isAddingToCampaigns, setIsAddingToCampaigns] = useState(false);

  const addFileToCampaigns = useCallback(
    async (
      selectedFile: any,
      selectedCampaigns: string[],
      getStoredJwt: () => string | null,
      addLocalNotification: (
        type: string,
        title: string,
        message: string
      ) => void,
      onSuccess?: () => void
    ) => {
      if (selectedCampaigns.length === 0) {
        addLocalNotification(
          NOTIFICATION_TYPES.ERROR,
          "No Campaigns Selected",
          "Please select at least one campaign to add the file to."
        );
        return;
      }

      if (!selectedFile) {
        addLocalNotification(
          NOTIFICATION_TYPES.ERROR,
          "No File Selected",
          "No file selected."
        );
        return;
      }

      // Start progress tracking
      const fileKey = selectedFile.file_key;
      const fileName = selectedFile.file_name;
      const campaignIds = [...selectedCampaigns];

      setIsAddingToCampaigns(true);
      setCampaignAdditionProgress({ [fileKey]: 0 });

      try {
        const jwt = getStoredJwt();
        if (!jwt) {
          addLocalNotification(
            NOTIFICATION_TYPES.ERROR,
            "Authentication Required",
            "Please log in again to add files to campaigns."
          );
          return;
        }

        // Add file to each selected campaign with progress updates
        for (let i = 0; i < campaignIds.length; i++) {
          const campaignId = campaignIds[i];
          const progress = Math.round(((i + 1) / campaignIds.length) * 100);

          // Update progress
          setCampaignAdditionProgress({ [fileKey]: progress });

          const { response, jwtExpired } =
            await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
              ),
              {
                method: "POST",
                jwt,
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  type: "file",
                  id: selectedFile.file_key,
                  name: selectedFile.file_name,
                }),
              }
            );

          if (jwtExpired) {
            addLocalNotification(
              NOTIFICATION_TYPES.ERROR,
              "Session Expired",
              "Your session has expired. Please log in again."
            );
            return;
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to add file to campaign: ${errorText}`);
          }
        }

        // Complete progress
        setCampaignAdditionProgress({ [fileKey]: 100 });

        console.log(
          `Successfully added "${fileName}" to ${campaignIds.length} campaign(s)`
        );
        addLocalNotification(
          NOTIFICATION_TYPES.SUCCESS,
          "File Added to Campaign",
          `Successfully added "${fileName}" to ${campaignIds.length} campaign(s)`
        );

        // Dispatch event to notify other components that a file was added to campaigns
        window.dispatchEvent(
          new CustomEvent("campaign-file-added", {
            detail: {
              file: selectedFile,
              campaignIds: campaignIds,
              campaignCount: campaignIds.length,
            },
          })
        );

        // Call success callback if provided
        if (onSuccess) {
          onSuccess();
        }

        // Clear progress after a short delay
        setTimeout(() => {
          setCampaignAdditionProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileKey];
            return newProgress;
          });
          setIsAddingToCampaigns(false);
        }, 1500);
      } catch (error) {
        console.error("Error adding file to campaigns:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        addLocalNotification(
          NOTIFICATION_TYPES.ERROR,
          "Error Adding File to Campaign",
          `Error adding file to campaigns: ${errorMessage}`
        );

        // Clear progress on error
        setCampaignAdditionProgress((prev) => {
          const newProgress = { ...prev };
          delete newProgress[fileKey];
          return newProgress;
        });
        setIsAddingToCampaigns(false);
      }
    },
    []
  );

  return {
    campaignAdditionProgress,
    isAddingToCampaigns,
    addFileToCampaigns,
  };
}
