import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES, USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration, getStoredJwt } from "../../lib/auth";
import { API_CONFIG } from "../../shared";
import { Button } from "../button/Button";
import { Modal } from "../modal/Modal";
import { MultiSelect } from "../select/MultiSelect";
import type { Campaign } from "../../types/campaign";

interface PdfFile {
  fileKey: string;
  fileName: string;
  fileSize: number;
  uploaded: string;
  status: string;
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export function PdfList() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<PdfFile | null>(null);
  const [isAddToCampaignModalOpen, setIsAddToCampaignModalOpen] =
    useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [addingToCampaigns, setAddingToCampaigns] = useState(false);

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
      setFiles(data.files || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.FAILED_TO_RETRIEVE_FILES
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
              id: selectedFile.fileKey,
              name: selectedFile.fileName,
            }),
          }
        )
      );

      await Promise.all(promises);

      // Close modal and reset state
      setIsAddToCampaignModalOpen(false);
      setSelectedFile(null);
      setSelectedCampaigns([]);
    } catch (err) {
      console.error("Failed to add resource to campaigns:", err);
      setError("Failed to add resource to campaigns");
    } finally {
      setAddingToCampaigns(false);
    }
  };

  const openAddToCampaignModal = (file: PdfFile) => {
    setSelectedFile(file);
    setSelectedCampaigns([]);
    setIsAddToCampaignModalOpen(true);
  };

  useEffect(() => {
    fetchFiles();
    fetchCampaigns();
  }, [fetchFiles, fetchCampaigns]);

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
      <h3 className="text-lg font-semibold">Uploaded PDF Files</h3>
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.fileKey}
            className="p-4 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h4
                  className="font-medium text-gray-900 dark:text-gray-100 truncate cursor-help"
                  title={file.fileName}
                >
                  {file.fileName}
                </h4>
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <span>
                    Size: {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <span>•</span>
                  <span>
                    Uploaded: {new Date(file.uploaded).toLocaleString()}
                  </span>
                </div>
                {file.metadata?.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                    {file.metadata.description}
                  </p>
                )}
                {file.metadata?.tags && file.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {file.metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 ml-4">
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
        ))}

        {/* Add to Campaign Modal */}
        <Modal
          isOpen={isAddToCampaignModalOpen}
          onClose={() => setIsAddToCampaignModalOpen(false)}
          cardStyle={{ width: 500, height: 400 }}
        >
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">
              "{selectedFile?.fileName}"
            </h3>

            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No campaigns available.</p>
                <p className="text-sm mt-2">
                  Create a campaign first to add resources.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select campaigns
                  </label>
                  <MultiSelect
                    options={campaigns.map((campaign) => ({
                      value: campaign.campaignId,
                      label: campaign.name,
                    }))}
                    selectedValues={selectedCampaigns}
                    onSelectionChange={setSelectedCampaigns}
                    placeholder="Choose campaigns..."
                  />
                </div>

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
                    disabled={selectedCampaigns.length === 0}
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
