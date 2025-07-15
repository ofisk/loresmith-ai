import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { cn } from "@/lib/utils";

interface PdfUploadProps {
  onUpload: (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => void;
  loading?: boolean;
  className?: string;
}

export const PdfUpload = ({
  onUpload,
  loading = false,
  className,
}: PdfUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
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
      const tagsArray = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      onUpload(selectedFile, filename, description, tagsArray);
    }
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
                <div className="text-ob-base-200 text-sm">PDF files only</div>
              </div>
            )}
          </button>
        </div>

        {/* Form Fields */}
        <div className="mx-auto max-w-md w-full space-y-3 text-left">
          {!isValid && (
            <div className="text-ob-destructive text-sm">
              Please select a valid PDF file
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
              placeholder="Enter a filename for this PDF..."
              value={filename}
              onValueChange={(value) => setFilename(value)}
              disabled={loading || !selectedFile}
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
              placeholder="Enter a description for this PDF..."
              value={description}
              onValueChange={(value) => setDescription(value)}
              disabled={loading}
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
            <Input
              id="pdf-tags"
              placeholder="Enter tags separated by commas..."
              value={tags}
              onValueChange={(value) => setTags(value)}
              disabled={loading}
            />
            <div className="text-ob-base-200 text-xs">
              Example: research, important, draft
            </div>
          </div>

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={isUploadDisabled}
            loading={loading}
            variant={selectedFile ? "primary" : "secondary"}
            size="base"
            className={cn(
              "w-48",
              selectedFile &&
                "bg-[#F48120] hover:bg-[#F48120]/90 text-white border-[#F48120]",
              !selectedFile &&
                "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed",
              "mt-16"
            )}
          >
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>
    </Card>
  );
};
