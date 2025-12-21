import { useId, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { ProcessingProgressBar } from "@/components/progress/ProcessingProgressBar";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/types/campaign";
import type { ProcessingProgress } from "@/types/progress";

// Function to sanitize filename by removing/replacing URL-encoded characters
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filesystem characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, "_") // Replace any other non-alphanumeric chars except -_.
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
    .replace(/\.(pdf|txt|doc|docx)$/i, (match) => match.toLowerCase()); // Ensure file extensions are lowercase
};

interface ResourceUploadProps {
  onUpload: (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => void;
  onCancel?: () => void;
  loading?: boolean;
  className?: string;
  jwtUsername?: string | null;
  uploadProgress?: ProcessingProgress | null;
  // Campaign selection props
  campaigns?: Campaign[];
  selectedCampaigns?: string[];
  onCampaignSelectionChange?: (campaignIds: string[]) => void;
  campaignName?: string;
  onCampaignNameChange?: (name: string) => void;
  onCreateCampaign?: () => void;
  showCampaignSelection?: boolean;
}

export const ResourceUpload = ({
  onUpload,
  onCancel,
  loading = false,
  className,
  jwtUsername: _jwtUsername,
  uploadProgress,
  campaigns = [],
  selectedCampaigns = [],
  onCampaignSelectionChange,
  campaignName: _campaignName = "",
  onCampaignNameChange: _onCampaignNameChange,
  onCreateCampaign,
  showCampaignSelection = false,
}: ResourceUploadProps) => {
  const resourceFilenameId = useId();
  const resourceDescriptionId = useId();
  const resourceTagsId = useId();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [_isValid, setIsValid] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [initialValues, setInitialValues] = useState({
    filename: "",
    description: "",
    tags: [] as string[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = selectedFiles[currentFileIndex];

  // Show progress bar if upload is in progress
  if (uploadProgress) {
    return (
      <div className={cn("space-y-4", className)}>
        <ProcessingProgressBar progress={uploadProgress} />
      </div>
    );
  }

  // Helper function to validate and filter files
  const validateAndFilterFiles = (files: File[]): File[] => {
    // Filter by file type
    const typeValidFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    // Filter by file size (100MB max)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    const validFiles = typeValidFiles.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
        const fileSizeMB = file.size / (1024 * 1024);
        alert(
          `File "${file.name}" is too large (${fileSizeMB.toFixed(2)}MB). Maximum file size is ${maxSizeMB}MB. Please split the file into smaller parts.`
        );
        return false;
      }
      return true;
    });

    return validFiles;
  };

  // Helper function to set selected files state
  const setSelectedFilesState = (validFiles: File[]) => {
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      setCurrentFileIndex(0);
      setFilename(sanitizeFilename(validFiles[0].name));
      setIsValid(true);
      setUploadSuccess(false);
      setInitialValues({
        filename: sanitizeFilename(validFiles[0].name),
        description: "",
        tags: [],
      });
    } else {
      setSelectedFiles([]);
      setFilename("");
      setIsValid(false);
      setUploadSuccess(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = validateAndFilterFiles(files);
    setSelectedFilesState(validFiles);
  };

  const handleUpload = () => {
    if (currentFile) {
      onUpload(currentFile, filename, description, tags);
      setUploadSuccess(true);
      setInitialValues({
        filename: filename,
        description: description,
        tags: tags,
      });
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const validFiles = validateAndFilterFiles(files);
    setSelectedFilesState(validFiles);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTag();
    }
  };

  const handleNextFile = () => {
    if (currentFileIndex < selectedFiles.length - 1) {
      const nextIndex = currentFileIndex + 1;
      setCurrentFileIndex(nextIndex);
      setFilename(sanitizeFilename(selectedFiles[nextIndex].name));
      setUploadSuccess(false);
      setInitialValues({
        filename: sanitizeFilename(selectedFiles[nextIndex].name),
        description: "",
        tags: [],
      });
    }
  };

  const handlePreviousFile = () => {
    if (currentFileIndex > 0) {
      const prevIndex = currentFileIndex - 1;
      setCurrentFileIndex(prevIndex);
      setFilename(sanitizeFilename(selectedFiles[prevIndex].name));
      setUploadSuccess(false);
      setInitialValues({
        filename: sanitizeFilename(selectedFiles[prevIndex].name),
        description: "",
        tags: [],
      });
    }
  };

  const hasChanges =
    filename !== initialValues.filename ||
    description !== initialValues.description ||
    JSON.stringify(tags) !== JSON.stringify(initialValues.tags);

  const isUploadDisabled =
    !currentFile || loading || (uploadSuccess && !hasChanges);

  return (
    <div className={cn("p-6 h-full flex flex-col", className)}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Add resource
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Add tomes and scrolls to your library
        </p>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col justify-between py-8">
        {/* Details Section */}
        <div className="space-y-12">
          {/* File Upload Area */}
          <div className="flex justify-center">
            <button
              type="button"
              className={cn(
                "w-full max-w-md border-2 border-dashed border-gray-300/80 dark:border-gray-600/80 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition hover:border-gray-400 dark:hover:border-gray-500 focus:border-gray-400 dark:focus:border-gray-500 outline-none bg-gray-50/20 dark:bg-gray-800/10",
                loading && "opacity-50 pointer-events-none"
              )}
              aria-label="Upload resource file"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={(e) => e.preventDefault()}
              onDragLeave={(e) => e.preventDefault()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
                multiple
              />
              {currentFile ? (
                <div className="text-center relative w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles([]);
                      setCurrentFileIndex(0);
                      setFilename("");
                      setDescription("");
                      setTags([]);
                      setTagInput("");
                      setUploadSuccess(false);
                      setIsValid(false);
                      // Reset the file input so the same file can be selected again
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition"
                    aria-label="Clear file"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <title>Clear file</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  <div className="text-ob-base-300 text-sm font-medium mb-2">
                    {currentFile.name}
                  </div>
                  <div className="text-ob-base-200 text-sm">
                    {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-ob-base-300 text-sm font-medium mb-2">
                    Click to select or drag and drop files here
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <FormField
              id={resourceFilenameId}
              label="Filename"
              placeholder="Name this mighty tome…"
              value={filename}
              onValueChange={(value, _isValid) => setFilename(value)}
              disabled={loading}
            />
            <FormField
              id={resourceDescriptionId}
              label="Description (optional)"
              placeholder="Describe the perils and promises within..."
              value={description}
              onValueChange={(value, _isValid) => setDescription(value)}
              disabled={loading}
            />
            <FormField
              id={resourceTagsId}
              label="Tags (optional)"
              placeholder="Mark this tome with its arcane keywords…"
              value={tagInput}
              onValueChange={(value, _isValid) => setTagInput(value)}
              onKeyPress={handleTagKeyPress}
              disabled={loading}
            >
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full"
                    >
                      {tag}
                      <FormButton
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1.5 p-0.5 focus:outline-none rounded-full hover:bg-blue-100 dark:hover:bg-blue-800/30"
                        icon={
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <title>Remove tag</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        }
                      />
                    </span>
                  ))}
                </div>
              )}
              <div className="text-ob-base-200 text-xs">
                Example: undead, forest, cursed treasure
              </div>
            </FormField>
          </div>
        </div>

        {/* Campaign Selection Section */}
        <div className="mt-8">
          <div className="border-t border-ob-base-600 pt-12">
            {showCampaignSelection && (
              <>
                <h3 className="text-sm font-medium text-ob-base-200 mb-3">
                  Add to campaign (optional)
                </h3>

                <div className="space-y-2 mb-4">
                  <div>
                    {campaigns.length > 0 ? (
                      <>
                        <div className="block text-sm font-medium text-ob-base-200 mb-3">
                          Select campaigns
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {campaigns.map((campaign) => {
                            const isSelected = selectedCampaigns.includes(
                              campaign.campaignId
                            );
                            return (
                              <button
                                key={campaign.campaignId}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    // Remove from selection
                                    onCampaignSelectionChange?.(
                                      selectedCampaigns.filter(
                                        (id) => id !== campaign.campaignId
                                      )
                                    );
                                  } else {
                                    // Add to selection
                                    onCampaignSelectionChange?.([
                                      ...selectedCampaigns,
                                      campaign.campaignId,
                                    ]);
                                  }
                                }}
                                className={cn(
                                  "px-3 py-1.5 text-sm transition-colors rounded border-2",
                                  "focus:outline-none",
                                  isSelected
                                    ? "font-medium bg-purple-200 dark:bg-purple-800/40 text-purple-600 dark:text-purple-400 border-neutral-300 dark:border-neutral-700 hover:bg-purple-300 dark:hover:bg-purple-800/50"
                                    : "font-normal bg-purple-50/30 dark:bg-purple-900/10 text-purple-600 dark:text-purple-400 border-neutral-300 dark:border-neutral-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/15"
                                )}
                              >
                                {campaign.name}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={onCreateCampaign}
                            className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
                            title="Create new campaign"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-ob-base-300">
                          No campaigns yet. Create one to get started!
                        </p>
                        <button
                          type="button"
                          onClick={onCreateCampaign}
                          className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center gap-2 text-sm"
                        >
                          <Plus size={14} />
                          Create campaign
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Multi-file Navigation Buttons */}
        {selectedFiles.length > 1 && (
          <div className="flex justify-center gap-2">
            {currentFileIndex > 0 && (
              <FormButton onClick={handlePreviousFile} variant="secondary">
                Previous File
              </FormButton>
            )}
            {currentFileIndex < selectedFiles.length - 1 && (
              <FormButton onClick={handleNextFile} variant="secondary">
                Next File
              </FormButton>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          {currentFile ? (
            <FormButton
              variant="primary"
              onClick={handleUpload}
              disabled={isUploadDisabled}
              icon={
                uploadSuccess && !hasChanges ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Upload complete</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : undefined
              }
            >
              {uploadSuccess && !hasChanges ? "Complete" : "Upload"}
            </FormButton>
          ) : (
            <FormButton variant="primary" disabled={true}>
              Upload
            </FormButton>
          )}
          <FormButton
            onClick={() => {
              // Reset form state
              setSelectedFiles([]);
              setCurrentFileIndex(0);
              setFilename("");
              setDescription("");
              setTags([]);
              setTagInput("");
              setUploadSuccess(false);
              setIsValid(false);
              // Close the modal
              onCancel?.();
            }}
            variant="secondary"
          >
            Cancel
          </FormButton>
        </div>
      </div>
    </div>
  );
};
