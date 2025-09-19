import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES, JWT_STORAGE_KEY } from "../../constants";
import type { AutoRAGEvent, FileUploadEvent } from "../../lib/event-bus";
import { EVENT_TYPES, useEventBus } from "../../lib/event-bus";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared";
import type { Campaign } from "../../types/campaign";
import { Button } from "../button/Button";
import { Modal } from "../modal/Modal";
import { MultiSelect } from "../select/MultiSelect";
import { FileStatusIndicator } from "./FileStatusIndicator";

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

type ResourceListProps = {};

function getDisplayName(filename: string | undefined | null): string {
  if (!filename) {
    return "Unknown file";
  }
  return filename;
}

export function ResourceList(_props: ResourceListProps) {
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

  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Wait for JWT to be available (with retry mechanism)
      let jwt = getStoredJwt();
      let retries = 0;
      const maxRetries = 10;

      while (!jwt && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        jwt = getStoredJwt();
        retries++;
      }

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

      // Dispatch custom event to notify shard components to refresh
      // This will trigger shard list refresh in any open campaign shard managers
      window.dispatchEvent(
        new CustomEvent("resource-added-to-campaign", {
          detail: {
            campaignIds: selectedCampaigns,
            fileKey: selectedFile.file_key,
            fileName: selectedFile.file_name,
          },
        })
      );

      // Also dispatch event for chat integration - check for new shards after a delay
      setTimeout(() => {
        checkForNewShards(selectedCampaigns, selectedFile.file_name);
      }, 3000); // 3 second delay to allow shard generation to complete
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

  const toggleFileExpansion = (fileKey: string) => {
    const newExpandedFiles = new Set(expandedFiles);
    if (newExpandedFiles.has(fileKey)) {
      newExpandedFiles.delete(fileKey);
    } else {
      newExpandedFiles.add(fileKey);
    }
    setExpandedFiles(newExpandedFiles);
  };

  // Check for new shards after adding a resource to campaigns
  const checkForNewShards = async (campaignIds: string[], fileName: string) => {
    try {
      console.log(
        "[ResourceList] Checking for new shards for campaigns:",
        campaignIds
      );

      // Check each campaign for new shards
      for (const campaignId of campaignIds) {
        const { response, jwtExpired } = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SHARDS(
              campaignId
            )
          ),
          { jwt: localStorage.getItem(JWT_STORAGE_KEY) }
        );

        if (jwtExpired) {
          console.warn("[ResourceList] JWT expired while checking for shards");
          return;
        }

        if (response.ok) {
          const data = (await response.json()) as { shards?: any[] };
          const shards = data.shards || [];

          console.log(
            `[ResourceList] Found ${shards.length} staged shards for campaign ${campaignId}`
          );

          if (shards.length > 0) {
            // Show a notification to the user about new shards
            console.log("[ResourceList] New shards available:", shards);

            // Dispatch event for chat integration
            window.dispatchEvent(
              new CustomEvent("shards-generated", {
                detail: {
                  campaignId,
                  fileName,
                  shards: shards,
                  resourceId: selectedFile?.file_key,
                },
              })
            );

            // Notification will be sent via SSE from the server
            console.log(
              `[ResourceList] ${shards.length} shards generated for campaign: ${campaignId}`
            );
          }
        }
      }
    } catch (error) {
      console.error("[ResourceList] Error checking for new shards:", error);
    }
  };

  useEffect(() => {
    fetchResources();
    fetchCampaigns();
  }, [fetchResources, fetchCampaigns]);

  // Listen for file upload events to refresh the resource list
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.COMPLETED,
    (event) => {
      console.log(
        "[ResourceList] File upload completed, refreshing resource list:",
        event
      );
      fetchResources();
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      console.log(
        "[ResourceList] AutoRAG sync completed, refreshing resource list:",
        event
      );
      fetchResources();
    },
    []
  );

  // Listen for file change events from the AI agent
  useEffect(() => {
    const handleFileChange = (event: CustomEvent) => {
      if (event.detail?.type === "file-changed") {
        console.log("[ResourceList] File change detected, refreshing...");
        fetchResources();
      }
    };

    // Listen for custom file change events
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

    // Listen for file status update events
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

  // Log modal state when it opens
  useEffect(() => {
    if (isAddToCampaignModalOpen && selectedFile) {
      console.log("[ResourceList] Modal opened with state:", {
        selectedFile: {
          fileKey: selectedFile.file_key,
          fileName: selectedFile.file_name,
          existingCampaigns: selectedFile.campaigns,
        },
        campaignsCount: campaigns.length,
        campaigns: campaigns.map((c) => ({ id: c.campaignId, name: c.name })),
        selectedCampaigns,
      });
    }
  }, [isAddToCampaignModalOpen, selectedFile, campaigns, selectedCampaigns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading resources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">{error}</div>
        <Button
          onClick={fetchResources}
          variant="secondary"
          size="sm"
          className="mx-auto"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-2">The shelves lie bare</div>
        <p className="text-sm text-gray-400">
          Place a scroll upon the archive to awaken it
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.file_key}
            className="p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help">
                    {getDisplayName(file.file_name)}
                  </h4>
                  {AuthService.getUsernameFromStoredJwt() && (
                    <FileStatusIndicator
                      tenant={AuthService.getUsernameFromStoredJwt()!}
                      initialStatus={file.status}
                      className="flex-shrink-0"
                    />
                  )}
                </div>
                <button
                  onClick={() => toggleFileExpansion(file.file_key)}
                  type="button"
                  className="flex-shrink-0 p-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
                >
                  {expandedFiles.has(file.file_key) ? (
                    <CaretDownIcon size={16} className="text-purple-600" />
                  ) : (
                    <CaretRightIcon size={16} className="text-purple-600" />
                  )}
                </button>
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  expandedFiles.has(file.file_key)
                    ? "max-h-96 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-4 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Uploaded:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {new Date(file.created_at)
                        .toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "2-digit",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })
                        .replace(",", "")
                        .replace(" PM", "p")
                        .replace(" AM", "a")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Size:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {file.file_size
                        ? (file.file_size / 1024 / 1024).toFixed(2)
                        : "Unknown"}{" "}
                      MB
                    </span>
                  </div>
                </div>

                {file.description && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {file.description}
                    </p>
                  </div>
                )}
                {file.tags && file.tags.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {file.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {file.campaigns && file.campaigns.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Linked campaigns:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {file.campaigns.map((campaign) => (
                        <span
                          key={campaign.campaignId}
                          className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
                        >
                          {campaign.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <Button
                    onClick={() => {
                      console.log(
                        "[ResourceList] Add to campaign button clicked for file:",
                        {
                          fileKey: file.file_key,
                          fileName: file.file_name,
                          existingCampaigns: file.campaigns,
                        }
                      );
                      setSelectedFile(file);
                      setIsAddToCampaignModalOpen(true);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
                  >
                    Add to campaign
                  </Button>
                  <Button
                    onClick={() => {
                      // TODO: Implement edit functionality
                      console.log("Edit file:", file.file_key);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isAddToCampaignModalOpen}
        onClose={() => setIsAddToCampaignModalOpen(false)}
        cardStyle={{ width: 500, maxHeight: "90vh" }}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            "{selectedFile ? getDisplayName(selectedFile.file_name) : ""}"
          </h3>

          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">
                You haven't created any campaigns yet
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                <p>
                  To create a campaign, chat with the LoreSmith agent! Simply
                  ask something like:
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-left">
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                    💬 Try asking:
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    "Create a new D&D campaign called [Campaign Name]"
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    "Help me start a new campaign about [theme/idea]"
                  </p>
                </div>
                <p className="mt-3">
                  LoreSmith will help you design the campaign together and then
                  you can add resources to it!
                </p>
              </div>
            </div>
          ) : (
            <>
              {selectedFile?.campaigns && selectedFile.campaigns.length > 0 && (
                <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-md">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">
                    Linked campaigns:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFile.campaigns.map((campaign) => (
                      <span
                        key={campaign.campaignId}
                        className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
                      >
                        {campaign.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <fieldset className="mb-4">
                <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select campaigns
                </legend>
                {campaigns.filter(
                  (campaign) =>
                    !selectedFile?.campaigns?.some(
                      (c) => c.campaignId === campaign.campaignId
                    )
                ).length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md">
                    This resource is already in all available campaigns.
                  </div>
                ) : (
                  <MultiSelect
                    options={campaigns
                      .filter(
                        (campaign) =>
                          !selectedFile?.campaigns?.some(
                            (c) => c.campaignId === campaign.campaignId
                          )
                      )
                      .map((campaign) => ({
                        value: campaign.campaignId,
                        label: campaign.name,
                      }))}
                    selectedValues={selectedCampaigns}
                    onSelectionChange={setSelectedCampaigns}
                    placeholder="Choose campaigns..."
                  />
                )}
              </fieldset>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  onClick={() => setIsAddToCampaignModalOpen(false)}
                  variant="secondary"
                  size="sm"
                  className="w-32 text-center justify-center"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    console.log(
                      "[ResourceList] Add button clicked with state:",
                      {
                        selectedCampaigns,
                        campaignsCount: campaigns.length,
                        availableCampaigns: campaigns.filter(
                          (campaign) =>
                            !selectedFile?.campaigns?.some(
                              (c) => c.campaignId === campaign.campaignId
                            )
                        ).length,
                        selectedFileCampaigns: selectedFile?.campaigns,
                      }
                    );
                    handleAddToCampaigns();
                  }}
                  disabled={
                    selectedCampaigns.length === 0 ||
                    campaigns.filter(
                      (campaign) =>
                        !selectedFile?.campaigns?.some(
                          (c) => c.campaignId === campaign.campaignId
                        )
                    ).length === 0
                  }
                  loading={addingToCampaigns}
                  variant="primary"
                  size="sm"
                  className="w-32 text-center justify-center"
                >
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
