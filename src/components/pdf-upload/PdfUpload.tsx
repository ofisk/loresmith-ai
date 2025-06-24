import { useState, useRef } from "react";
import { Button } from "@/components/button/Button";
import { Input } from "@/components/input/Input";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";

interface PdfUploadProps {
  onUpload: (file: File, description: string, tags: string[]) => void;
  loading?: boolean;
  className?: string;
}

export const PdfUpload = ({ onUpload, loading = false, className }: PdfUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isValid, setIsValid] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        setIsValid(true);
      } else {
        setSelectedFile(null);
        setIsValid(false);
      }
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      const tagsArray = tags
        .split(",")
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      
      onUpload(selectedFile, description, tagsArray);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setIsValid(true);
    } else {
      setIsValid(false);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const isUploadDisabled = !selectedFile || loading;

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h3 className="text-ob-base-300 font-medium">Upload PDF</h3>
        <p className="text-ob-base-200 text-sm">
          Select a PDF file to upload and add optional metadata
        </p>
      </div>

      {/* File Upload Area */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
          {
            "border-ob-border hover:border-ob-border-active": !selectedFile,
            "border-ob-primary": selectedFile,
            "border-ob-destructive": !isValid,
          }
        )}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
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
              PDF files only
            </div>
          </div>
        )}
      </div>

      {!isValid && (
        <div className="text-ob-destructive text-sm">
          Please select a valid PDF file
        </div>
      )}

      {/* Description Input */}
      <div className="space-y-2">
        <label className="text-ob-base-300 text-sm font-medium">
          Description (optional)
        </label>
        <Input
          placeholder="Enter a description for this PDF..."
          value={description}
          onValueChange={(value) => setDescription(value)}
          size="base"
        />
      </div>

      {/* Tags Input */}
      <div className="space-y-2">
        <label className="text-ob-base-300 text-sm font-medium">
          Tags (optional)
        </label>
        <Input
          placeholder="Enter tags separated by commas..."
          value={tags}
          onValueChange={(value) => setTags(value)}
          size="base"
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
        variant="primary"
        size="base"
        className="w-full"
      >
        {loading ? "Uploading..." : "Upload PDF"}
      </Button>
    </Card>
  );
}; 