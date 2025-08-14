import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES, USER_MESSAGES } from "../../constants";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared";
import type { Campaign } from "../../types/campaign";
import { Button } from "../button/Button";
import { Modal } from "../modal/Modal";
import { MultiSelect } from "../select/MultiSelect";
import { CaretDown, CaretRight } from "@phosphor-icons/react";

interface PdfFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description?: string;
  tags?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PdfFileWithCampaigns extends PdfFile {
  campaigns?: Campaign[];
}

interface PdfListProps {
  refreshTrigger?: number;
}

export function PdfList({ refreshTrigger }: PdfListProps) {
  const [files, setFiles] = useState<PdfFileWithCampaigns[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<PdfFileWithCampaigns | null>(
    null
  );
  const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
    useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [addingToCampaigns, setAddingToCampaigns] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const fetchPdfCampaigns = useCallback(async (files: PdfFile[]) => {
    try {
      const jwt = getStoredJwt();

      // For each file, fetch which campaigns it belongs to
      const filesWithCampaigns = await Promise.all(
        files.map(async (file) => {
          try {
            // Get all campaigns for this user
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

            const campaigns = campaignsWithFile.filter(Boolean) as Campaign[];

            return {
              ...file,
              campaigns,
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

      return filesWithCampaigns;
    } catch (err) {
      console.error("Failed to fetch PDF campaigns:", err);
      return files.map((file) => ({ ...file, campaigns: [] }));
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const jwt = getStoredJwt();
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
        { jwt }
      );

      if (jwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`);
      }

      const data = (await response.json()) as { files: PdfFile[] };
      const filesWithCampaigns = await fetchPdfCampaigns(data.files || []);
      setFiles(filesWithCampaigns);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.FAILED_TO_RETRIEVE_FILES
      );
    } finally {
      setLoading(false);
    }
  }, [fetchPdfCampaigns]);

  const fetchCampaigns = useCallback(async () => {
    try {
      const jwt = getStoredJwt();
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        { jwt }
      );

      if (jwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch campaigns: ${response.status}`);
      }

      const data = (await response.json()) as { campaigns: Campaign[] };
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    }
  }, []);

  const handleAddToCampaigns = async () => {
    if (!selectedFile || selectedCampaigns.length === 0) return;

    setAddingToCampaigns(true);
    try {
      const jwt = getStoredJwt();

      // Add resource to each selected campaign
      const promises = selectedCampaigns.map((campaignId) =>
        authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
          ),
          {
            jwt,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "pdf",
              id: selectedFile.file_key,
              name: selectedFile.file_name,
            }),
          }
        )
      );

      const results = await Promise.allSettled(promises);

      // Check if any requests failed
      const failedRequests = results.filter(
        (result) => result.status === "rejected"
      );
      if (failedRequests.length > 0) {
        console.error("Some requests failed:", failedRequests);
        setError(
          `Failed to add resource to ${failedRequests.length} campaign(s)`
        );
      } else {
        // Close modal and reset state
        setIsAddToCampaignModalOpen(false);
        setSelectedFile(null);
        setSelectedCampaigns([]);

        // Refresh the files to update campaign information
        fetchFiles();
      }
    } catch (err) {
      console.error("Failed to add resource to campaigns:", err);
      setError("Failed to add resource to campaigns");
    } finally {
      setAddingToCampaigns(false);
    }
  };

  const openAddToCampaignModal = (file: PdfFileWithCampaigns) => {
    setSelectedFile(file);
    setSelectedCampaigns([]);
    setIsAddToCampaignModalOpen(true);
  };

  const toggleFileExpansion = (fileKey: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileKey)) {
      newExpanded.delete(fileKey);
    } else {
      newExpanded.add(fileKey);
    }
    setExpandedFiles(newExpanded);
  };

  useEffect(() => {
    fetchFiles();
    fetchCampaigns();
  }, [fetchFiles, fetchCampaigns]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchFiles();
    }
  }, [refreshTrigger, fetchFiles]);

  if (loading) {
    return <div>Loading PDF files...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No PDF files uploaded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.file_key}
            className="p-4 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between">
                <h4
                  className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help flex-1 mr-3"
                  title={file.file_name}
                >
                  {file.file_name}
                </h4>
                <button
                  onClick={() => toggleFileExpansion(file.file_key)}
                  type="button"
                  className="flex-shrink-0 p-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
                >
                  {expandedFiles.has(file.file_key) ? (
                    <CaretDown size={16} className="text-purple-600" />
                  ) : (
                    <CaretRight size={16} className="text-purple-600" />
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

                {/* Description and tags */}
                {file.description && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {file.description}
                    </p>
                  </div>
                )}
                {file.tags && file.tags !== "[]" && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {JSON.parse(file.tags).map((tag: string) => (
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

                {/* Campaigns section */}
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

                {/* Add to Campaign button positioned at bottom right */}
                <div className="flex justify-end mt-4">
                  <Button
                    onClick={() => openAddToCampaignModal(file)}
                    variant="secondary"
                    size="sm"
                  >
                    Add to campaign
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add to Campaign Modal */}
        <Modal
          isOpen={isAddToCampaignModalOpen}
          onClose={() => setIsAddToCampaignModalOpen(false)}
          cardStyle={{ width: 500, height: 400 }}
        >
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">
              "{selectedFile?.file_name}"
            </h3>

            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No campaigns available.</p>
                <p className="text-sm mt-2">
                  Create a campaign first to add to library.
                </p>
              </div>
            ) : (
              <>
                {/* Show which campaigns the file is already in */}
                {selectedFile?.campaigns &&
                  selectedFile.campaigns.length > 0 && (
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
                    onClick={handleAddToCampaigns}
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
    </div>
  );
}
