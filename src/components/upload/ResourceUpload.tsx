import { useId, useRef, useState } from "react";
import { Button, PrimaryActionButton } from "@/components/button";
import { FormField } from "@/components/input/FormField";
import { ProcessingProgressBar } from "@/components/progress/ProcessingProgressBar";
import { MultiSelect } from "@/components/select/MultiSelect";
import { cn } from "@/lib/utils";
import type { ProcessingProgress } from "../../types/progress";
import type { Campaign } from "../../types/campaign";

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
  loading = false,
  className,
  jwtUsername,
  uploadProgress,
  campaigns = [],
  selectedCampaigns = [],
  onCampaignSelectionChange,
  campaignName = "",
  onCampaignNameChange,
  onCreateCampaign,
  showCampaignSelection = false,
}: ResourceUploadProps) => {
  const resourceFilenameId = useId();
  const resourceDescriptionId = useId();
  const resourceTagsId = useId();
  const campaignNameId = useId();
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

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
    const validFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

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
    <div className={cn("space-y-4", className)}>
      <div className="mx-auto max-w-md w-full">
        {jwtUsername && (
          <div className="text-ob-base-200 text-xs mb-4 mt-2 text-left">
            Authenticated as{" "}
            <span className="font-semibold">{jwtUsername}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 75 }}>
        {/* File Upload Area */}
        <div className="flex justify-center" style={{ marginBottom: 50 }}>
          <button
            type="button"
            className={cn(
              "border-2 border-dashed border-ob-base-200 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition hover:border-ob-accent-500 focus:border-ob-accent-500 outline-none",
              loading && "opacity-50 pointer-events-none",
              className
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
              <div className="text-center">
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
                  Click to select or drag and drop
                </div>
                <div className="text-ob-base-200 text-sm">
                  Supported resource types: PDF and other files (more coming
                  soon)
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
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
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1.5 p-0.5 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 focus:outline-none rounded-full hover:bg-blue-100 dark:hover:bg-blue-800/30"
                    >
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
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="text-ob-base-200 text-xs">
              Example: undead, forest, cursed treasure
            </div>
          </FormField>

          {/* Campaign Selection Section */}
          {showCampaignSelection && currentFile && (
            <div className="space-y-4">
              <div className="border-t border-ob-base-600 pt-4">
                <h3 className="text-sm font-medium text-ob-base-200 mb-3">
                  Add to Campaign
                </h3>

                {campaigns.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <div className="block text-sm font-medium text-ob-base-200 mb-2">
                        Select existing campaigns
                      </div>
                      <MultiSelect
                        options={campaigns.map((campaign) => ({
                          value: campaign.campaignId,
                          label: campaign.name,
                        }))}
                        selectedValues={selectedCampaigns}
                        onSelectionChange={
                          onCampaignSelectionChange || (() => {})
                        }
                        placeholder="Choose campaigns..."
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={campaignNameId}
                      className="block text-sm font-medium text-ob-base-200 mb-2"
                    >
                      Or create a new campaign
                    </label>
                    <input
                      id={campaignNameId}
                      type="text"
                      placeholder="Campaign name"
                      value={campaignName}
                      onChange={(e) => onCampaignNameChange?.(e.target.value)}
                      className="w-full px-3 py-2 bg-ob-base-700 border border-ob-base-600 rounded text-ob-base-200 placeholder-ob-base-400 focus:outline-none focus:ring-2 focus:ring-ob-primary-500"
                    />
                  </div>
                  {campaignName.trim() && (
                    <Button
                      type="button"
                      onClick={onCreateCampaign}
                      variant="secondary"
                      size="sm"
                      className="w-full"
                    >
                      Create Campaign & Add File
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-center mt-8">
            {currentFile ? (
              <PrimaryActionButton
                onClick={handleUpload}
                disabled={isUploadDisabled}
                loading={loading}
              >
                {uploadSuccess && !hasChanges ? (
                  <div className="flex items-center justify-center gap-2">
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
                    <span>Complete</span>
                  </div>
                ) : (
                  "Upload"
                )}
              </PrimaryActionButton>
            ) : (
              <Button
                onClick={handleUpload}
                disabled={isUploadDisabled}
                loading={loading}
                variant="secondary"
                size="sm"
                className="w-40 h-10 text-center justify-center text-base font-medium bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed"
              >
                Upload
              </Button>
            )}
          </div>

          {/* Multi-file Navigation Buttons */}
          {selectedFiles.length > 1 && (
            <div className="flex justify-center mt-4 gap-2">
              {currentFileIndex > 0 && (
                <Button
                  onClick={handlePreviousFile}
                  variant="secondary"
                  size="sm"
                  className="w-40 h-8 text-center justify-center"
                >
                  Previous File
                </Button>
              )}
              {currentFileIndex < selectedFiles.length - 1 && (
                <Button
                  onClick={handleNextFile}
                  variant="secondary"
                  size="sm"
                  className="w-40 h-8 text-center justify-center"
                >
                  Next File
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
