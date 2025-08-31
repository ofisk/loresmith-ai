import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES } from "../constants";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../services/auth-service";
import { API_CONFIG } from "../shared";
import type { Campaign } from "../types/campaign";

interface ResourceFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description?: string;
  tags?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ResourceFileWithCampaigns extends ResourceFile {
  campaigns?: Campaign[];
}

export function useResourceManagement() {
  const [files, setFiles] = useState<ResourceFileWithCampaigns[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] =
    useState<ResourceFileWithCampaigns | null>(null);
  const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
    useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [addingToCampaigns, setAddingToCampaigns] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Fetch campaigns for each resource file
  const fetchResourceCampaigns = useCallback(async (files: ResourceFile[]) => {
    try {
      const jwt = getStoredJwt();

      const filesWithCampaigns = await Promise.all(
        files.map(async (file) => {
          try {
            const {
              response: campaignsResponse,
              jwtExpired: campaignsJwtExpired,
            } = await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
              { jwt }
            );

            if (campaignsJwtExpired) {
              throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
            }

            if (!campaignsResponse.ok) {
              throw new Error(
                `Failed to fetch campaigns: ${campaignsResponse.status}`
              );
            }

            const campaignsData = (await campaignsResponse.json()) as {
              campaigns: Campaign[];
            };
            const userCampaigns = campaignsData.campaigns || [];

            // For each campaign, check if this file is in it
            const campaignsWithFile = await Promise.all(
              userCampaigns.map(async (campaign) => {
                try {
                  const {
                    response: resourcesResponse,
                    jwtExpired: resourcesJwtExpired,
                  } = await authenticatedFetchWithExpiration(
                    API_CONFIG.buildUrl(
                      API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(
                        campaign.campaignId
                      )
                    ),
                    { jwt }
                  );

                  if (resourcesJwtExpired) {
                    throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
                  }

                  if (!resourcesResponse.ok) {
                    throw new Error(
                      `Failed to fetch campaign resources: ${resourcesResponse.status}`
                    );
                  }

                  const resourcesData = (await resourcesResponse.json()) as {
                    resources: any[];
                  };
                  const resources = resourcesData.resources || [];

                  // Check if this file is in the campaign
                  const fileInCampaign = resources.some(
                    (resource) => resource.file_key === file.file_key
                  );

                  return fileInCampaign ? campaign : null;
                } catch (err) {
                  console.error(
                    `Failed to check campaign ${campaign.campaignId}:`,
                    err
                  );
                  return null;
                }
              })
            );

            // Filter out null campaigns and return file with campaigns
            const validCampaigns = campaignsWithFile.filter(
              (campaign) => campaign !== null
            ) as Campaign[];

            return {
              ...file,
              campaigns: validCampaigns,
            };
          } catch (err) {
            console.error(
              `Failed to fetch campaigns for file ${file.file_key}:`,
              err
            );
            return {
              ...file,
              campaigns: [],
            };
          }
        })
      );

      setFiles(filesWithCampaigns);
    } catch (err) {
      console.error("Failed to fetch resource campaigns:", err);
      setError("Failed to fetch resource campaigns");
    }
  }, []);

  // Fetch all campaigns
  const fetchCampaigns = useCallback(async () => {
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        return;
      }

      const { response: campaignsResponse, jwtExpired: campaignsJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
          { jwt }
        );

      if (campaignsJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!campaignsResponse.ok) {
        throw new Error(
          `Failed to fetch campaigns: ${campaignsResponse.status}`
        );
      }

      const campaignsData = (await campaignsResponse.json()) as {
        campaigns: Campaign[];
      };

      setCampaigns(campaignsData.campaigns || []);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    }
  }, []);

  // Fetch all resources
  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const jwt = getStoredJwt();
      if (!jwt) {
        setError(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
        return;
      }

      const { response: resourcesResponse, jwtExpired: resourcesJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
          { jwt }
        );

      if (resourcesJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!resourcesResponse.ok) {
        throw new Error(
          `Failed to fetch resources: ${resourcesResponse.status}`
        );
      }

      const resourcesData = (await resourcesResponse.json()) as {
        files: ResourceFile[];
      };

      const files = resourcesData.files || [];
      await fetchResourceCampaigns(files);
    } catch (err) {
      console.error("Failed to fetch resources:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch resources"
      );
    } finally {
      setLoading(false);
    }
  }, [fetchResourceCampaigns]);

  // Add resource to campaigns
  const handleAddToCampaigns = async () => {
    if (!selectedFile || selectedCampaigns.length === 0) return;

    try {
      setAddingToCampaigns(true);

      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      // Add to each selected campaign
      await Promise.all(
        selectedCampaigns.map(async (campaignId) => {
          const url = API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
          );
          const body = {
            type: "pdf",
            id: selectedFile.file_key,
            name: selectedFile.file_name,
          };

          console.log("[ResourceList] Adding resource to campaign:", {
            campaignId,
            url,
            body,
            selectedFile: {
              file_key: selectedFile.file_key,
              file_name: selectedFile.file_name,
            },
          });

          const { response: addResponse, jwtExpired: addJwtExpired } =
            await authenticatedFetchWithExpiration(url, {
              method: "POST",
              jwt,
              body: JSON.stringify(body),
            });

          if (addJwtExpired) {
            throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
          }

          console.log("[ResourceList] Campaign response:", {
            campaignId,
            status: addResponse.status,
            ok: addResponse.ok,
            statusText: addResponse.statusText,
          });

          if (!addResponse.ok) {
            const errorText = await addResponse.text();
            console.error("[ResourceList] Campaign error response:", errorText);
            throw new Error(
              `Failed to add resource to campaign ${campaignId}: ${addResponse.status} - ${errorText}`
            );
          }
        })
      );

      // Refresh the file list to show updated campaign associations
      await fetchResources();
      setSelectedCampaigns([]);
      setIsAddToCampaignModalOpen(false);

      // Dispatch custom event to notify snippet components to refresh
      window.dispatchEvent(
        new CustomEvent("resource-added-to-campaign", {
          detail: {
            campaignIds: selectedCampaigns,
            fileKey: selectedFile.file_key,
            fileName: selectedFile.file_name,
          },
        })
      );
    } catch (err) {
      console.error("Failed to add resource to campaigns:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add resource to campaigns"
      );
    } finally {
      setAddingToCampaigns(false);
    }
  };

  // Toggle file expansion
  const toggleFileExpansion = (fileKey: string) => {
    const newExpandedFiles = new Set(expandedFiles);
    if (newExpandedFiles.has(fileKey)) {
      newExpandedFiles.delete(fileKey);
    } else {
      newExpandedFiles.add(fileKey);
    }
    setExpandedFiles(newExpandedFiles);
  };

  // Open add to campaign modal
  const openAddToCampaignModal = (file: ResourceFileWithCampaigns) => {
    console.log("[ResourceList] Add to campaign button clicked for file:", {
      fileKey: file.file_key,
      fileName: file.file_name,
      existingCampaigns: file.campaigns,
    });
    setSelectedFile(file);
    setIsAddToCampaignModalOpen(true);
  };

  // Close add to campaign modal
  const closeAddToCampaignModal = () => {
    setIsAddToCampaignModalOpen(false);
    setSelectedCampaigns([]);
  };

  // Initialize data on mount
  useEffect(() => {
    fetchResources();
    fetchCampaigns();
  }, [fetchResources, fetchCampaigns]);

  // Listen for file change events from the AI agent
  useEffect(() => {
    const handleFileChange = (event: CustomEvent) => {
      if (event.detail?.type === "file-changed") {
        console.log("[ResourceList] File change detected, refreshing...");
        fetchResources();
      }
    };

    window.addEventListener("file-changed", handleFileChange as EventListener);

    return () => {
      window.removeEventListener(
        "file-changed",
        handleFileChange as EventListener
      );
    };
  }, [fetchResources]);

  // Listen for file status update events from FileStatusIndicator
  useEffect(() => {
    const handleFileStatusUpdate = (event: CustomEvent) => {
      if (event.detail?.updatedCount > 0) {
        console.log(
          "[ResourceList] File status update detected, refreshing..."
        );
        fetchResources();
      }
    };

    window.addEventListener(
      "file-status-updated",
      handleFileStatusUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "file-status-updated",
        handleFileStatusUpdate as EventListener
      );
    };
  }, [fetchResources]);

  return {
    // State
    files,
    campaigns,
    loading,
    error,
    selectedFile,
    isAddToCampaignModalOpen,
    selectedCampaigns,
    addingToCampaigns,
    expandedFiles,

    // Actions
    fetchResources,
    fetchCampaigns,
    handleAddToCampaigns,
    toggleFileExpansion,
    openAddToCampaignModal,
    closeAddToCampaignModal,
    setSelectedCampaigns,
  };
}
