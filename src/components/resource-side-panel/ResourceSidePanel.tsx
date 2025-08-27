import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  SignOut,
  XCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useState } from "react";
import { useAutoRAGPolling } from "../../hooks/useAutoRAGPolling";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { AutoRAGService } from "../../services/autorag-service";
import { API_CONFIG, AUTORAG_CONFIG } from "../../shared";
import type { Campaign } from "../../types/campaign";
import { Card } from "../card/Card";
import { Modal } from "../modal/Modal";
import { StorageTracker } from "../storage-tracker";
import { ResourceList } from "../upload/ResourceList";
import { ResourceUpload } from "../upload/ResourceUpload";

interface ResourceSidePanelProps {
  className?: string;
  isAuthenticated?: boolean;
  onLogout?: () => Promise<void>;
  showUserMenu?: boolean;
  setShowUserMenu?: (show: boolean) => void;
}

type UploadStep =
  | "idle"
  | "starting"
  | "uploading"
  | "completing"
  | "success"
  | "processing"
  | "error";

interface UploadProgress {
  currentStep: UploadStep;
  currentPart: number;
  totalParts: number;
  percentage: number;
  message: string;
  autoragStatus?: string;
}

interface FileUpload {
  id: string;
  filename: string;
  progress: UploadProgress;
  isPolling: boolean;
}

export function ResourceSidePanel({
  className = "",
  isAuthenticated = false,
  onLogout,
  showUserMenu = false,
  setShowUserMenu,
}: ResourceSidePanelProps) {
  const campaignNameId = useId();
  const campaignDescriptionId = useId();
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] =
    useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [fileUploads, setFileUploads] = useState<Map<string, FileUpload>>(
    new Map()
  );
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);

  // AutoRAG job polling hook
  const { jobStatus, startPolling } = useAutoRAGPolling();

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

  // Fetch campaigns when campaigns section is opened
  useEffect(() => {
    if (isCampaignsOpen && isAuthenticated) {
      fetchCampaigns();
    }
  }, [isCampaignsOpen, isAuthenticated, fetchCampaigns]);

  const handleCreateCampaign = async () => {
    if (!campaignName.trim()) return;

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        console.error("No JWT token available");
        return;
      }

      console.log("Creating campaign:", {
        name: campaignName,
        description: "",
      });

      const response = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CREATE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            name: campaignName,
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
      setIsCreateCampaignModalOpen(false);
      setCampaignName("");

      // Refresh campaigns list
      await fetchCampaigns();

      // Show success feedback (you can replace this with a proper notification system)
      console.log("Campaign created successfully!");
    } catch (error) {
      console.error("Failed to create campaign:", error);
      // TODO: Add error notification
    }
  };

  // Update upload progress based on AutoRAG job status
  useEffect(() => {
    if (jobStatus && currentUploadId) {
      const currentUpload = fileUploads.get(currentUploadId);
      if (currentUpload) {
        if (jobStatus.ended_at) {
          // Job has completed
          const isSuccess =
            !jobStatus.end_reason || jobStatus.end_reason === "completed";

          setFileUploads((prev) => {
            const newMap = new Map(prev);
            const upload = newMap.get(currentUploadId);
            if (upload) {
              newMap.set(currentUploadId, {
                ...upload,
                progress: {
                  ...upload.progress,
                  currentStep: isSuccess ? "processing" : "error",
                  message: isSuccess
                    ? "File uploaded and indexed successfully! Ready for use."
                    : `AutoRAG processing failed: ${jobStatus.end_reason}`,
                  autoragStatus: isSuccess
                    ? "Indexed and ready"
                    : `Failed: ${jobStatus.end_reason}`,
                },
                isPolling: false,
              });
            }
            return newMap;
          });

          // Update database status
          if (currentUploadId) {
            const currentUpload = fileUploads.get(currentUploadId);
            if (currentUpload) {
              try {
                const jwt = getStoredJwt();
                if (jwt) {
                  const tenant = AuthService.getUsernameFromStoredJwt();
                  const fileKey = tenant
                    ? `autorag/${tenant}/${currentUpload.filename}`
                    : currentUploadId;

                  authenticatedFetchWithExpiration(
                    API_CONFIG.buildUrl(
                      API_CONFIG.ENDPOINTS.LIBRARY.FILE_UPDATE(fileKey)
                    ),
                    {
                      method: "PUT",
                      jwt,
                      body: JSON.stringify({
                        status: isSuccess ? "processed" : "error",
                      }),
                      headers: {
                        "Content-Type": "application/json",
                      },
                    }
                  )
                    .then((response) => {
                      if (!response.response.ok) {
                        console.warn(
                          `[ResourceSidePanel] Failed to update file status to ${isSuccess ? "processed" : "error"} in database`
                        );
                      }
                    })
                    .catch((error) => {
                      console.warn(
                        `[ResourceSidePanel] Failed to update file status to ${isSuccess ? "processed" : "error"} in database:`,
                        error
                      );
                    });
                }
              } catch (error) {
                console.warn(
                  `[ResourceSidePanel] Failed to update file status to ${isSuccess ? "processed" : "error"} in database:`,
                  error
                );
              }
            }
          }
        } else {
          // Job is still running
          setFileUploads((prev) => {
            const newMap = new Map(prev);
            const upload = newMap.get(currentUploadId);
            if (upload) {
              newMap.set(currentUploadId, {
                ...upload,
                progress: {
                  ...upload.progress,
                  currentStep: "processing",
                  message:
                    "File uploaded successfully! AutoRAG is processing and indexing your file...",
                  autoragStatus: `Processing... (Started: ${new Date(jobStatus.started_at).toLocaleTimeString()})`,
                },
                isPolling: true,
              });
            }
            return newMap;
          });
        }
      }
    }
  }, [jobStatus, currentUploadId, fileUploads]);

  const handleUpload = async (
    file: File,
    filename: string,
    _description: string,
    _tags: string[]
  ) => {
    const uploadId = `${filename}`;
    setCurrentUploadId(uploadId);

    setFileUploads((prev) => {
      const newMap = new Map(prev);
      newMap.set(uploadId, {
        id: uploadId,
        filename,
        progress: {
          currentStep: "starting",
          currentPart: 0,
          totalParts: 0,
          percentage: 0,
          message: "Starting upload...",
        },
        isPolling: false,
      });
      return newMap;
    });

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token found");
      }

      // Extract username from JWT
      const tenant = AuthService.getUsernameFromStoredJwt();
      if (!tenant) {
        throw new Error("No username/tenant available for upload");
      }

      // Step 1: Upload file directly to storage
      setFileUploads((prev) => {
        const newMap = new Map(prev);
        const upload = newMap.get(uploadId);
        if (upload) {
          newMap.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              currentStep: "uploading",
              message: "Uploading file to storage...",
            },
          });
        }
        return newMap;
      });

      console.log("[ResourceSidePanel] Upload request body:", {
        tenant,
        originalName: filename,
        contentType: file.type || "application/pdf",
        fileSize: file.size,
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
      setFileUploads((prev) => {
        const newMap = new Map(prev);
        const upload = newMap.get(uploadId);
        if (upload) {
          newMap.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              currentStep: "success",
              percentage: 100,
              message:
                "Upload completed successfully! Triggering AutoRAG sync...",
              autoragStatus: "Triggering sync...",
            },
          });
        }
        return newMap;
      });

      // Trigger AutoRAG sync and start polling for job status
      try {
        const ragId = AUTORAG_CONFIG.LIBRARY_RAG_ID;
        const jobId = await AutoRAGService.triggerSync(ragId);

        console.log(
          "[ResourceSidePanel] AutoRAG sync triggered, job_id:",
          jobId
        );

        // Update status to show sync was triggered
        setFileUploads((prev) => {
          const newMap = new Map(prev);
          const upload = newMap.get(uploadId);
          if (upload) {
            newMap.set(uploadId, {
              ...upload,
              progress: {
                ...upload.progress,
                message: "AutoRAG sync triggered! Monitoring processing...",
                autoragStatus: `Sync started (Job: ${jobId})`,
              },
            });
          }
          return newMap;
        });

        // Start polling for job status
        startPolling(ragId, jobId);
      } catch (syncError) {
        console.error("[ResourceSidePanel] AutoRAG sync error:", syncError);

        // Update status to show sync failed
        setFileUploads((prev) => {
          const newMap = new Map(prev);
          const upload = newMap.get(uploadId);
          if (upload) {
            newMap.set(uploadId, {
              ...upload,
              progress: {
                ...upload.progress,
                currentStep: "error",
                message:
                  "Upload successful but AutoRAG sync failed. File may not be searchable.",
                autoragStatus: `Sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
              },
            });
          }
          return newMap;
        });
      }

      // Show processing status for a bit longer, then auto-close
      setTimeout(() => {
        setIsAddModalOpen(false);
        setRefreshTrigger((prev) => prev + 1);
        // Clean up the upload entry
        setFileUploads((prev) => {
          const newMap = new Map(prev);
          newMap.delete(uploadId);
          return newMap;
        });
        setCurrentUploadId(null);
      }, 5000); // Give more time to see the processing status
    } catch (error) {
      console.error("[ResourceSidePanel] Upload error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload file";

      setFileUploads((prev) => {
        const newMap = new Map(prev);
        const upload = newMap.get(uploadId);
        if (upload) {
          newMap.set(uploadId, {
            ...upload,
            progress: {
              ...upload.progress,
              currentStep: "error",
              message: errorMessage,
            },
          });
        }
        return newMap;
      });
    }
  };

  const getStepIcon = (step: UploadStep) => {
    switch (step) {
      case "success":
        return <CheckCircle size={20} className="text-green-500" />;
      case "processing":
        return <Clock size={20} className="text-blue-500" />;
      case "error":
        return <XCircle size={20} className="text-red-500" />;
      default:
        return null;
    }
  };

  const getStepColor = (step: UploadStep) => {
    switch (step) {
      case "starting":
      case "uploading":
      case "completing":
      case "processing":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  // Check if any files are currently uploading (not just polling)
  const hasActiveUploads = Array.from(fileUploads.values()).some(
    (upload) =>
      upload.progress?.currentStep === "starting" ||
      upload.progress?.currentStep === "uploading"
  );

  // Get the current upload for display (if any)
  const currentUpload = currentUploadId
    ? fileUploads.get(currentUploadId)
    : null;
  const showProgress =
    currentUpload && currentUpload.progress?.currentStep !== "idle";

  return (
    <div
      className={`w-80 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-300 dark:border-neutral-800">
        <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
          Resources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your campaign content
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Campaigns Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsCampaignsOpen(!isCampaignsOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your campaigns</span>
            </div>
            {isCampaignsOpen ? (
              <CaretDown size={16} />
            ) : (
              <CaretRight size={16} />
            )}
          </button>

          {isCampaignsOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-y-auto">
              {isAuthenticated ? (
                <>
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => setIsCreateCampaignModalOpen(true)}
                      className="w-full px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus size={14} />
                      Create campaign
                    </button>
                  </div>
                  {campaignsLoading ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-gray-500 mb-2">
                        Loading campaigns...
                      </div>
                    </div>
                  ) : campaignsError ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-red-500 mb-2">
                        Error loading campaigns
                      </div>
                      <p className="text-sm text-gray-400">{campaignsError}</p>
                      <button
                        type="button"
                        onClick={fetchCampaigns}
                        className="mt-2 text-sm text-purple-600 hover:text-purple-700 underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : campaigns.length === 0 ? (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
                      <div className="text-gray-500 mb-2">
                        The war room awaits
                      </div>
                      <p className="text-sm text-gray-400">
                        Forge your first campaign to begin the adventure
                      </p>
                    </div>
                  ) : (
                    <div className="border-t border-neutral-200 dark:border-neutral-700">
                      {campaigns.map((campaign) => (
                        <div
                          key={campaign.campaignId}
                          className="p-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {campaign.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Created{" "}
                            {new Date(campaign.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Please log in to view campaigns
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Resources Section */}
        <Card className="p-0 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your resource library</span>
            </div>
            {isLibraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>

          {isLibraryOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-y-auto">
              {isAuthenticated ? (
                <>
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      className="w-40 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus size={14} />
                      Add to library
                    </button>
                  </div>
                  <div className="border-t border-neutral-200 dark:border-neutral-700">
                    <ResourceList refreshTrigger={refreshTrigger} />
                    <StorageTracker />
                  </div>
                </>
              ) : (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Please log in to view your library
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Username Display and Menu - At the very bottom */}
      {isAuthenticated &&
        AuthService.getUsernameFromStoredJwt() &&
        onLogout &&
        setShowUserMenu && (
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
            <div className="relative user-menu-container">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors w-full"
              >
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span className="truncate">
                  {AuthService.getUsernameFromStoredJwt()}
                </span>
                <CaretDown
                  size={16}
                  className="transition-transform duration-200 ml-auto"
                />
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-2"
                    >
                      <SignOut size={16} />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Upload Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          // Allow closing if no files are actively uploading
          // Polling can continue in the background
          if (!hasActiveUploads) {
            setIsAddModalOpen(false);
            // Clean up all upload entries
            setFileUploads(new Map());
            setCurrentUploadId(null);
          }
        }}
        cardStyle={{ width: 560, height: 560 }}
      >
        <div className="space-y-4">
          {/* Progress Section */}
          {showProgress && currentUpload && (
            <div className="border-b border-gray-200 pb-4">
              <div className="flex items-center gap-3 mb-3">
                {getStepIcon(currentUpload.progress?.currentStep)}
                <span
                  className={`font-medium ${getStepColor(currentUpload.progress?.currentStep)}`}
                >
                  {currentUpload.progress?.currentStep === "starting" &&
                    "Preparing Upload"}
                  {currentUpload.progress?.currentStep === "uploading" &&
                    "Uploading File"}
                  {currentUpload.progress?.currentStep === "success" &&
                    "Upload Complete"}
                  {currentUpload.progress?.currentStep === "processing" &&
                    "Processing with AutoRAG"}
                  {currentUpload.progress?.currentStep === "error" &&
                    "Upload Failed"}
                </span>
              </div>

              {/* Progress Bar */}
              {currentUpload.progress?.currentStep === "uploading" && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${currentUpload.progress.percentage}%` }}
                  />
                </div>
              )}

              {/* Status Message */}
              <p className="text-sm text-gray-600">
                {currentUpload.progress?.message}
              </p>

              {/* AutoRAG Status */}
              {currentUpload.progress?.currentStep === "processing" &&
                currentUpload.progress?.autoragStatus && (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <Clock size={14} />
                    <span>{currentUpload.progress?.autoragStatus}</span>
                  </div>
                )}

              {/* Part Progress for Uploading */}
              {currentUpload.progress?.currentStep === "uploading" &&
                currentUpload.progress?.totalParts > 0 && (
                  <p className="text-xs text-gray-500">
                    Part {currentUpload.progress?.currentPart} of{" "}
                    {currentUpload.progress?.totalParts}
                  </p>
                )}
            </div>
          )}

          {/* Upload Form */}
          <ResourceUpload
            onUpload={handleUpload}
            loading={hasActiveUploads}
            className="border-0 p-0 shadow-none"
            jwtUsername={AuthService.getUsernameFromStoredJwt()}
          />
        </div>
      </Modal>

      {/* Create Campaign Modal */}
      <Modal
        isOpen={isCreateCampaignModalOpen}
        onClose={() => setIsCreateCampaignModalOpen(false)}
        cardStyle={{ width: 480, height: 400 }}
      >
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Create new campaign
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Set up your campaign details to get started
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor={campaignNameId}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Campaign name
              </label>
              <input
                id={campaignNameId}
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Enter campaign name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor={campaignDescriptionId}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id={campaignDescriptionId}
                placeholder="Describe your campaign"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 justify-center">
            <button
              type="button"
              onClick={() => setIsCreateCampaignModalOpen(false)}
              className="w-40 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCampaign}
              disabled={!campaignName.trim()}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  (
                    document.querySelector(`#${campaignNameId}`) as HTMLElement
                  )?.focus();
                }
              }}
              className="w-40 px-3 py-1.5 bg-purple-600 dark:bg-purple-700 text-white rounded hover:bg-purple-700 dark:hover:bg-purple-800 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600 dark:disabled:hover:bg-purple-700"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
