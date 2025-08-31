import { useId } from "react";
import { FormField } from "../input/FormField";
import { Button } from "../button/Button";
import { PrimaryActionButton } from "../button/PrimaryActionButton";

interface UploadFormProps {
  filename: string;
  description: string;
  tags: string[];
  tagInput: string;
  loading: boolean;
  uploadSuccess: boolean;
  hasChanges: boolean;
  isUploadDisabled: boolean;
  currentFile: File | null;
  selectedFiles: File[];
  currentFileIndex: number;
  onFilenameChange: (value: string, isValid: boolean) => void;
  onDescriptionChange: (value: string, isValid: boolean) => void;
  onTagInputChange: (value: string, isValid: boolean) => void;
  onTagKeyPress: (event: React.KeyboardEvent) => void;
  onRemoveTag: (tag: string) => void;
  onUpload: () => void;
  onNextFile: () => void;
  onPreviousFile: () => void;
}

export function UploadForm({
  filename,
  description,
  tags,
  tagInput,
  loading,
  uploadSuccess,
  hasChanges,
  isUploadDisabled,
  currentFile,
  selectedFiles,
  currentFileIndex,
  onFilenameChange,
  onDescriptionChange,
  onTagInputChange,
  onTagKeyPress,
  onRemoveTag,
  onUpload,
  onNextFile,
  onPreviousFile,
}: UploadFormProps) {
  const resourceFilenameId = useId();
  const resourceDescriptionId = useId();
  const resourceTagsId = useId();

  return (
    <div className="space-y-4">
      <FormField
        id={resourceFilenameId}
        label="Filename"
        placeholder="Name this mighty tome…"
        value={filename}
        onValueChange={onFilenameChange}
        disabled={loading}
      />
      <FormField
        id={resourceDescriptionId}
        label="Description (optional)"
        placeholder="Describe the perils and promises within..."
        value={description}
        onValueChange={onDescriptionChange}
        disabled={loading}
      />
      <FormField
        id={resourceTagsId}
        label="Tags (optional)"
        placeholder="Mark this tome with its arcane keywords…"
        value={tagInput}
        onValueChange={onTagInputChange}
        onKeyPress={onTagKeyPress}
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
                  onClick={() => onRemoveTag(tag)}
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

      {/* Upload Button */}
      <div className="flex justify-center mt-8">
        {currentFile ? (
          <PrimaryActionButton
            onClick={onUpload}
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
            onClick={onUpload}
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
              onClick={onPreviousFile}
              variant="secondary"
              size="sm"
              className="w-40 h-8 text-center justify-center"
            >
              Previous File
            </Button>
          )}
          {currentFileIndex < selectedFiles.length - 1 && (
            <Button
              onClick={onNextFile}
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
  );
}
