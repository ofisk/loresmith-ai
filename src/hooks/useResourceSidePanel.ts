import { useCallback, useEffect, useState } from "react";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { API_CONFIG } from "../shared";
import { AutoRAGService } from "../services/autorag-service";
import { useAutoRAGPolling } from "./useAutoRAGPolling";
import type { Campaign } from "../types/campaign";

interface FileUpload {
  id: string;
  file: File;
  filename: string;
  progress: {
    currentStep: string;
    percentage: number;
    message: string;
    autoragStatus?: string;
  };
}

interface ResourceSidePanelState {
  isLibraryOpen: boolean;
  isCampaignsOpen: boolean;
  refreshTrigger: number;
  isAddModalOpen: boolean;
  isCreateCampaignModalOpen: boolean;
  campaignName: string;
  campaigns: Campaign[];
  campaignsLoading: boolean;
  campaignsError: string | null;
  fileUploads: Map<string, FileUpload>;
  currentUploadId: string | null;
}

export function useResourceSidePanel() {
  const [state, setState] = useState<ResourceSidePanelState>({
    isLibraryOpen: false,
    isCampaignsOpen: false,
    refreshTrigger: 0,
    isAddModalOpen: false,
    isCreateCampaignModalOpen: false,
    campaignName: "",
    campaigns: [],
    campaignsLoading: false,
    campaignsError: null,
    fileUploads: new Map(),
    currentUploadId: null,
  });

  // AutoRAG job polling hook
  const { jobStatus, startPolling } = useAutoRAGPolling();

  // Update state with partial updates
  const updateState = useCallback(
    (updates: Partial<ResourceSidePanelState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    try {
      updateState({ campaignsLoading: true, campaignsError: null });

      const jwt = getStoredJwt();
      if (!jwt) {
        updateState({ campaignsError: "No authentication token available" });
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
      updateState({ campaigns: data.campaigns || [] });
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      updateState({
        campaignsError:
          error instanceof Error ? error.message : "Failed to fetch campaigns",
      });
    } finally {
      updateState({ campaignsLoading: false });
    }
  }, [updateState]);

  // Create campaign
  const handleCreateCampaign = async () => {
    if (!state.campaignName.trim()) return;

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        console.error("No JWT token available");
        return;
      }

      console.log("Creating campaign:", {
        name: state.campaignName,
        description: "",
      });

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            name: state.campaignName,
            description: "",
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

      const data = await response.response.json();
      console.log("Campaign created successfully:", data);

      // Close modal and reset form
      updateState({
        isCreateCampaignModalOpen: false,
        campaignName: "",
      });

      // Refresh campaigns list
      await fetchCampaigns();

      console.log("Campaign created successfully!");
    } catch (error) {
      console.error("Failed to create campaign:", error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (
    file: File,
    tenant: string,
    filename: string
  ) => {
    const uploadId = `${tenant}-${filename}-${Date.now()}`;
    const upload: FileUpload = {
      id: uploadId,
      file,
      filename,
      progress: {
        currentStep: "uploading",
        percentage: 0,
        message: "Uploading file...",
      },
    };

    // Add upload to state
    updateState({
      fileUploads: new Map(state.fileUploads.set(uploadId, upload)),
      currentUploadId: uploadId,
    });

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No JWT token available");
      }

      // Update progress
      updateState({
        fileUploads: new Map(
          state.fileUploads.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              percentage: 50,
              message: "Uploading to storage...",
            },
          })
        ),
      });

      // Direct upload to R2 storage
      const uploadResponse = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(tenant, filename)
        ),
        {
          method: "PUT",
          jwt,
          body: file,
          headers: {
            "Content-Type": file.type || "application/pdf",
          },
        }
      );

      if (uploadResponse.jwtExpired) {
        throw new Error("Authentication expired. Please log in again.");
      }

      if (!uploadResponse.response.ok) {
        const errorText = await uploadResponse.response.text();
        throw new Error(
          `Upload failed: ${uploadResponse.response.status} ${errorText}`
        );
      }

      // Success state - trigger AutoRAG sync and start polling
      updateState({
        fileUploads: new Map(
          state.fileUploads.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              currentStep: "success",
              percentage: 100,
              message:
                "Upload completed successfully! Triggering AutoRAG sync...",
              autoragStatus: "Triggering sync...",
            },
          })
        ),
      });

      // Trigger AutoRAG sync and start polling for job status
      try {
        const ragId = "loresmith-library-autorag"; // This should come from config
        const jobId = await AutoRAGService.triggerSync(ragId);

        console.log(
          "[ResourceSidePanel] AutoRAG sync triggered, job_id:",
          jobId
        );

        // Update status to show sync was triggered
        updateState({
          fileUploads: new Map(
            state.fileUploads.set(uploadId, {
              ...upload,
              progress: {
                ...upload.progress,
                message: "AutoRAG sync triggered! Monitoring processing...",
                autoragStatus: `Sync started (Job: ${jobId})`,
              },
            })
          ),
        });

        // Start polling for job status
        startPolling(ragId, jobId);
      } catch (syncError) {
        console.error("[ResourceSidePanel] AutoRAG sync error:", syncError);

        // Update status to show sync failed
        updateState({
          fileUploads: new Map(
            state.fileUploads.set(uploadId, {
              ...upload,
              progress: {
                ...upload.progress,
                currentStep: "error",
                message:
                  "Upload successful but AutoRAG sync failed. File may not be searchable.",
                autoragStatus: `Sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
              },
            })
          ),
        });
      }
    } catch (error) {
      console.error("[ResourceSidePanel] Upload error:", error);

      // Update status to show upload failed
      updateState({
        fileUploads: new Map(
          state.fileUploads.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              currentStep: "error",
              percentage: 0,
              message: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          })
        ),
      });
    }
  };

  // Update upload progress based on AutoRAG job status
  useEffect(() => {
    if (jobStatus && state.currentUploadId) {
      const currentUpload = state.fileUploads.get(state.currentUploadId);
      if (currentUpload) {
        if (jobStatus.ended_at) {
          // Job has completed
          const isSuccess =
            !jobStatus.end_reason || jobStatus.end_reason === "completed";

          updateState({
            fileUploads: new Map(
              state.fileUploads.set(state.currentUploadId, {
                ...currentUpload,
                progress: {
                  ...currentUpload.progress,
                  currentStep: isSuccess ? "completed" : "error",
                  percentage: isSuccess ? 100 : 0,
                  message: isSuccess
                    ? "File processing completed successfully!"
                    : `Processing failed: ${jobStatus.end_reason || "Unknown error"}`,
                  autoragStatus: isSuccess
                    ? "Processing completed"
                    : `Processing failed: ${jobStatus.end_reason || "Unknown error"}`,
                },
              })
            ),
          });
        } else if (jobStatus.started_at) {
          // Job is running
          updateState({
            fileUploads: new Map(
              state.fileUploads.set(state.currentUploadId, {
                ...currentUpload,
                progress: {
                  ...currentUpload.progress,
                  currentStep: "processing",
                  percentage: 75,
                  message: "Processing file with AutoRAG...",
                  autoragStatus: `Processing (Job: ${jobStatus.id})`,
                },
              })
            ),
          });
        }
      }
    }
  }, [jobStatus, state.currentUploadId, state.fileUploads, updateState]);

  // Fetch campaigns when campaigns section is opened
  useEffect(() => {
    if (state.isCampaignsOpen) {
      fetchCampaigns();
    }
  }, [state.isCampaignsOpen, fetchCampaigns]);

  return {
    // State
    ...state,

    // Actions
    fetchCampaigns,
    handleCreateCampaign,
    handleFileUpload,

    // State setters
    setIsLibraryOpen: (isOpen: boolean) =>
      updateState({ isLibraryOpen: isOpen }),
    setIsCampaignsOpen: (isOpen: boolean) =>
      updateState({ isCampaignsOpen: isOpen }),
    setRefreshTrigger: (trigger: number) =>
      updateState({ refreshTrigger: trigger }),
    setIsAddModalOpen: (isOpen: boolean) =>
      updateState({ isAddModalOpen: isOpen }),
    setIsCreateCampaignModalOpen: (isOpen: boolean) =>
      updateState({ isCreateCampaignModalOpen: isOpen }),
    setCampaignName: (name: string) => updateState({ campaignName: name }),

    // AutoRAG polling
    jobStatus,
  };
}
