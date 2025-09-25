import { useId, useRef, useState } from "react";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { ProcessingProgressBar } from "@/components/progress/ProcessingProgressBar";
import { MultiSelect } from "@/components/select/MultiSelect";
import { cn } from "@/lib/utils";
import type { Campaign } from "../../types/campaign";
import type { ProcessingProgress } from "../../types/progress";

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
    <div className={cn("p-6", className)}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Add resource
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload files to your resource library
        </p>
      </div>

      {/* File Upload Area */}
      <div className="flex justify-center mb-4">
        <button
          type="button"
          className={cn(
            "border-2 border-dashed border-purple-300 dark:border-purple-600 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition hover:border-purple-400 dark:hover:border-purple-500 focus:border-purple-400 dark:focus:border-purple-500 outline-none bg-purple-50/30 dark:bg-purple-900/10",
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
                Supported resource types: PDF and other files (more coming soon)
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

        {/* Campaign Selection Section */}
        {showCampaignSelection && currentFile && (
          <div className="space-y-3">
            <div className="border-t border-ob-base-600 pt-3">
              <h3 className="text-sm font-medium text-ob-base-200 mb-3">
                Add to Campaign
              </h3>

              {campaigns.length > 0 && (
                <div className="space-y-2">
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

              <div className="space-y-2">
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
                  <FormButton
                    onClick={onCreateCampaign}
                    variant="secondary"
                    className="w-full"
                  >
                    Create Campaign & Add File
                  </FormButton>
                )}
              </div>
            </div>
          </div>
        )}
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

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          {currentFile ? (
            <FormButton
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
            <FormButton disabled={true}>Upload</FormButton>
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
