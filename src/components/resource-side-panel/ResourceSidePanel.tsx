import { useState, useEffect } from "react";
import {
  CaretDown,
  CaretRight,
  FileText,
  Plus,
  CheckCircle,
  SignOut,
  XCircle,
  Clock,
} from "@phosphor-icons/react";
import { Card } from "../card/Card";
import { ResourceList } from "../upload/ResourceList";
import { Modal } from "../modal/Modal";
import { ResourceUpload } from "../upload/ResourceUpload";
import { StorageTracker } from "../storage-tracker";
import {
  getStoredJwt,
  authenticatedFetchWithExpiration,
  AuthService,
} from "../../services/auth-service";
import { AutoRAGService } from "../../services/autorag-service";
import { API_CONFIG, AUTORAG_CONFIG } from "../../shared";
import { useAutoRAGPolling } from "../../hooks/useAutoRAGPolling";

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
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [fileUploads, setFileUploads] = useState<Map<string, FileUpload>>(
    new Map()
  );
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);

  // AutoRAG job polling hook
  const { jobStatus, startPolling } = useAutoRAGPolling();

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="w-full p-3 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Plus size={16} className="text-purple-500" />
            <span className="font-medium">Add to library</span>
          </button>
        </Card>

        {/* Resources Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your library</span>
            </div>
            {isLibraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>

          {isLibraryOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-y-auto">
              {isAuthenticated ? (
                <ResourceList refreshTrigger={refreshTrigger} />
              ) : (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Please log in to view your library
                </div>
              )}
            </div>
          )}
        </Card>

        {isAuthenticated && <StorageTracker />}
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
    </div>
  );
}
