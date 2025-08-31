import { useFileUpload } from "../../hooks/useFileUpload";
import { ProcessingProgressBar } from "../progress/ProcessingProgressBar";
import { FileUploadArea } from "./FileUploadArea";
import { UploadForm } from "./UploadForm";
import { cn } from "@/lib/utils";
import type { ProcessingProgress } from "../../types/progress";

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
}

export const ResourceUpload = ({
  onUpload,
  loading = false,
  className,
  jwtUsername,
  uploadProgress,
}: ResourceUploadProps) => {
  const {
    // State
    currentFile,
    filename,
    description,
    tags,
    tagInput,
    uploadSuccess,
    hasChanges,
    isUploadDisabled,
    selectedFiles,
    currentFileIndex,
    fileInputRef,

    // Actions
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleUpload,
    handleRemoveTag,
    handleTagKeyPress,
    handleNextFile,
    handlePreviousFile,
    triggerFileInput,
    handleFileInputKeyDown,
    handleFileInputKeyUp,

    // State setters
    setFilename,
    setDescription,
    setTagInput,
  } = useFileUpload(onUpload, loading, uploadProgress);

  // Show progress bar if upload is in progress
  if (uploadProgress) {
    return (
      <div className={cn("space-y-4", className)}>
        <ProcessingProgressBar progress={uploadProgress} />
      </div>
    );
  }

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
      <div>
        <FileUploadArea
          currentFile={currentFile}
          loading={loading}
          className={className}
          onFileSelect={handleFileSelect}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={(e) => e.preventDefault()}
          onDragLeave={(e) => e.preventDefault()}
          onKeyDown={handleFileInputKeyDown}
          onKeyUp={handleFileInputKeyUp}
          onClick={triggerFileInput}
          fileInputRef={fileInputRef}
        />

        <UploadForm
          filename={filename}
          description={description}
          tags={tags}
          tagInput={tagInput}
          loading={loading}
          uploadSuccess={uploadSuccess}
          hasChanges={hasChanges}
          isUploadDisabled={isUploadDisabled}
          currentFile={currentFile}
          selectedFiles={selectedFiles}
          currentFileIndex={currentFileIndex}
          onFilenameChange={(value, _isValid) => setFilename(value)}
          onDescriptionChange={(value, _isValid) => setDescription(value)}
          onTagInputChange={(value, _isValid) => setTagInput(value)}
          onTagKeyPress={handleTagKeyPress}
          onRemoveTag={handleRemoveTag}
          onUpload={handleUpload}
          onNextFile={handleNextFile}
          onPreviousFile={handlePreviousFile}
        />
      </div>
    </div>
  );
};
