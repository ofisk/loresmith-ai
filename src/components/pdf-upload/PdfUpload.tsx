import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { cn } from "@/lib/utils";
import { X } from "@phosphor-icons/react";

interface PdfUploadProps {
  onUpload: (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => void;
  loading?: boolean;
  className?: string;
  jwtUsername?: string | null;
}

export const PdfUpload = ({
  onUpload,
  loading = false,
  className,
  jwtUsername,
}: PdfUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isValid, setIsValid] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        setFilename(file.name);
        setIsValid(true);
      } else {
        setSelectedFile(null);
        setFilename("");
        setIsValid(false);
      }
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      const tagsArray = tags;

      onUpload(selectedFile, filename, description, tagsArray);
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setFilename(file.name);
      setIsValid(true);
    } else {
      setSelectedFile(null);
      setFilename("");
      setIsValid(false);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const isUploadDisabled = !selectedFile || loading;

  return (
    <Card className={cn("space-y-4", className)}>
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
            aria-label="Upload PDF file"
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
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              id="pdf-upload-input"
              onChange={handleFileSelect}
            />

            {selectedFile ? (
              <div className="space-y-2">
                <div className="text-ob-primary font-medium">
                  ✓ {selectedFile.name}
                </div>
                <div className="text-ob-base-200 text-sm">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-ob-base-200">
                  <svg
                    className="mx-auto h-12 w-12"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="text-ob-base-300 font-medium">
                  Click to select or drag and drop
                </div>
                <div className="text-ob-base-200 text-sm">
                  Supported format: PDF
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Form Fields */}
        <div className="mx-auto max-w-md w-full space-y-3 text-left">
          {!isValid && (
            <div className="text-ob-destructive text-sm">
              Please select a valid resource file (PDF)
            </div>
          )}

          {/* Filename Input */}
          <div className="flex flex-col space-y-1">
            <label
              htmlFor="pdf-filename"
              className="text-ob-base-300 text-sm font-medium mb-2 block"
            >
              Filename
            </label>
            <Input
              id="pdf-filename"
              value={filename}
              onValueChange={(value) => setFilename(value)}
              disabled={loading || !selectedFile}
              className="bg-neutral-200 text-black border border-gray-400 dark:bg-neutral-800 dark:text-white dark:border-gray-600"
            />
          </div>

          {/* Description Input */}
          <div className="flex flex-col space-y-1">
            <label
              htmlFor="pdf-description"
              className="text-ob-base-300 text-sm font-medium mb-2 block"
            >
              Description (optional)
            </label>
            <Input
              id="pdf-description"
              value={description}
              onValueChange={(value) => setDescription(value)}
              disabled={loading}
              className="bg-neutral-200 text-black border border-gray-400 dark:bg-neutral-800 dark:text-white dark:border-gray-600"
            />
          </div>

          {/* Tags Input */}
          <div className="flex flex-col space-y-1">
            <label
              htmlFor="pdf-tags"
              className="text-ob-base-300 text-sm font-medium mb-2 block"
            >
              Tags (optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-neutral-700 text-sm text-gray-800 dark:text-gray-100"
                >
                  {tag.length > 10 ? `${tag.slice(0, 10)}...` : tag}
                  <button
                    type="button"
                    className="ml-2 text-gray-500 hover:text-red-500 focus:outline-none"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <Input
              id="pdf-tags"
              value={tagInput}
              onValueChange={setTagInput}
              onKeyDown={handleTagInputKeyDown}
              disabled={loading}
              className="bg-neutral-200 text-black border border-gray-400 dark:bg-neutral-800 dark:text-white dark:border-gray-600"
            />
          </div>

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={isUploadDisabled}
            loading={loading}
            variant={selectedFile ? "primary" : "secondary"}
            size="sm"
            className={cn(
              "w-48 text-sm py-2",
              selectedFile &&
                "bg-[#F48120] hover:bg-[#F48120]/90 text-white border-[#F48120]",
              !selectedFile &&
                "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-300 dark:border-gray-700 cursor-not-allowed",
              "mt-6"
            )}
          >
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>
    </Card>
  );
};
