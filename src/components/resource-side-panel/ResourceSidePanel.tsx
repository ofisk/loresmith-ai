import { useState } from "react";
import {
  CaretDown,
  CaretRight,
  FileText,
  Plus,
  CheckCircle,
  SignOut,
  XCircle,
} from "@phosphor-icons/react";
import { Card } from "../card/Card";
import { ResourceList } from "../upload/ResourceList";
import { Modal } from "../modal/Modal";
import { ResourceUpload } from "../upload/ResourceUpload";
import { StorageTracker } from "../storage-tracker";
import {
  getStoredJwt,
  authenticatedFetchWithExpiration,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared";

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
  | "error";

interface UploadProgress {
  currentStep: UploadStep;
  currentPart: number;
  totalParts: number;
  percentage: number;
  message: string;
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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    currentStep: "idle",
    currentPart: 0,
    totalParts: 0,
    percentage: 0,
    message: "",
  });

  // Helper function to extract username from JWT
  const getUsernameFromJwt = (): string | null => {
    try {
      const jwt = getStoredJwt();
      if (!jwt) return null;

      const payload = JSON.parse(atob(jwt.split(".")[1]));
      return payload.username || null;
    } catch (error) {
      console.error(
        "[ResourceSidePanel] Failed to extract username from JWT:",
        error
      );
      return null;
    }
  };

  const handleUpload = async (
    file: File,
    filename: string,
    _description: string,
    _tags: string[]
  ) => {
    setUploadProgress({
      currentStep: "starting",
      currentPart: 0,
      totalParts: 0,
      percentage: 0,
      message: "Starting upload...",
    });

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        throw new Error("No authentication token found");
      }

      // Extract username from JWT
      const tenant = getUsernameFromJwt();
      if (!tenant) {
        throw new Error("No username/tenant available for upload");
      }

      // Step 1: Upload file directly to storage
      setUploadProgress((prev) => ({
        ...prev,
        currentStep: "uploading",
        message: "Uploading file to storage...",
      }));

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

      // Success state
      setUploadProgress((prev) => ({
        ...prev,
        currentStep: "success",
        percentage: 100,
        message: "Upload completed successfully!",
      }));

      // Auto-close modal after showing success
      setTimeout(() => {
        setIsAddModalOpen(false);
        setRefreshTrigger((prev) => prev + 1);
        // Reset progress state
        setUploadProgress({
          currentStep: "idle",
          currentPart: 0,
          totalParts: 0,
          percentage: 0,
          message: "",
        });
      }, 2000);
    } catch (error) {
      console.error("[ResourceSidePanel] Upload error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload file";

      setUploadProgress((prev) => ({
        ...prev,
        currentStep: "error",
        message: errorMessage,
      }));
    }
  };

  const getStepIcon = (step: UploadStep) => {
    switch (step) {
      case "success":
        return <CheckCircle size={20} className="text-green-500" />;
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
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const isUploading =
    uploadProgress.currentStep === "starting" ||
    uploadProgress.currentStep === "uploading";

  const showProgress = uploadProgress.currentStep !== "idle";

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
        getUsernameFromJwt() &&
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
                <span className="truncate">{getUsernameFromJwt()}</span>
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
          if (!isUploading) {
            setIsAddModalOpen(false);
            // Reset progress state when closing
            setUploadProgress({
              currentStep: "idle",
              currentPart: 0,
              totalParts: 0,
              percentage: 0,
              message: "",
            });
          }
        }}
        cardStyle={{ width: 560, height: 560 }}
      >
        <div className="space-y-4">
          {/* Progress Section */}
          {showProgress && (
            <div className="border-b border-gray-200 pb-4">
              <div className="flex items-center gap-3 mb-3">
                {getStepIcon(uploadProgress.currentStep)}
                <span
                  className={`font-medium ${getStepColor(uploadProgress.currentStep)}`}
                >
                  {uploadProgress.currentStep === "starting" &&
                    "Preparing Upload"}
                  {uploadProgress.currentStep === "uploading" &&
                    "Uploading File"}

                  {uploadProgress.currentStep === "success" &&
                    "Upload Complete"}
                  {uploadProgress.currentStep === "error" && "Upload Failed"}
                </span>
              </div>

              {/* Progress Bar */}
              {uploadProgress.currentStep === "uploading" && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
              )}

              {/* Status Message */}
              <p className="text-sm text-gray-600">{uploadProgress.message}</p>

              {/* Part Progress for Uploading */}
              {uploadProgress.currentStep === "uploading" &&
                uploadProgress.totalParts > 0 && (
                  <p className="text-xs text-gray-500">
                    Part {uploadProgress.currentPart} of{" "}
                    {uploadProgress.totalParts}
                  </p>
                )}
            </div>
          )}

          {/* Upload Form */}
          <ResourceUpload
            onUpload={handleUpload}
            loading={isUploading}
            className="border-0 p-0 shadow-none"
            jwtUsername={getUsernameFromJwt()}
          />
        </div>
      </Modal>
    </div>
  );
}
