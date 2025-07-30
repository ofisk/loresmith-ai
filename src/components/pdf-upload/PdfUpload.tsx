import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { cn } from "@/lib/utils";

// Function to sanitize filename by removing/replacing URL-encoded characters
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filesystem characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, "_") // Replace any other non-alphanumeric chars except -_.
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
    .replace(/\.pdf$/i, ".pdf"); // Ensure .pdf extension is lowercase
};

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
  const [isValid, setIsValid] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [initialValues, setInitialValues] = useState({
    filename: "",
    description: "",
    tags: [] as string[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        setFilename(sanitizeFilename(file.name));
        setIsValid(true);
        setUploadSuccess(false);
        setInitialValues({
          filename: sanitizeFilename(file.name),
          description: "",
          tags: [],
        });
      } else {
        setSelectedFile(null);
        setFilename("");
        setIsValid(false);
        setUploadSuccess(false);
      }
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      onUpload(selectedFile, filename, description, tags);
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
    const file = event.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setFilename(sanitizeFilename(file.name));
      setIsValid(true);
      setUploadSuccess(false);
      setInitialValues({
        filename: sanitizeFilename(file.name),
        description: "",
        tags: [],
      });
    } else {
      setSelectedFile(null);
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

  const hasChanges =
    filename !== initialValues.filename ||
    description !== initialValues.description ||
    JSON.stringify(tags) !== JSON.stringify(initialValues.tags);

  const isUploadDisabled =
    !selectedFile || loading || (uploadSuccess && !hasChanges);

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
                  Supported resource types: PDF (more coming soon)
                </div>
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
              placeholder="Name this mighty tome…"
              value={filename}
              onValueChange={(value, _isValid) => setFilename(value)}
              disabled={loading}
              className="[&:-webkit-autofill]:!bg-[#1a1a1a] [&:-webkit-autofill]:!text-white [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#1a1a1a_inset] [&:-webkit-autofill]:!border-[#1a1a1a] [&:-webkit-autofill]:!transition-[background-color] [&:-webkit-autofill]:!duration-[999999s] [&:-webkit-autofill]:!delay-[999999s] [&:-webkit-autofill]:![-webkit-text-fill-color:white]"
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
              placeholder="Describe the perils and promises within..."
              value={description}
              onValueChange={(value, _isValid) => setDescription(value)}
              disabled={loading}
              className="[&:-webkit-autofill]:!bg-[#1a1a1a] [&:-webkit-autofill]:!text-white [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#1a1a1a_inset] [&:-webkit-autofill]:!border-[#1a1a1a] [&:-webkit-autofill]:!transition-[background-color] [&:-webkit-autofill]:!duration-[999999s] [&:-webkit-autofill]:!delay-[999999s] [&:-webkit-autofill]:![-webkit-text-fill-color:white]"
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
              placeholder="Mark this tome with its arcane keywords…"
              value={tagInput}
              onValueChange={(value, _isValid) => setTagInput(value)}
              onKeyPress={handleTagKeyPress}
              disabled={loading}
              className="[&:-webkit-autofill]:!bg-[#1a1a1a] [&:-webkit-autofill]:!text-white [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#1a1a1a_inset] [&:-webkit-autofill]:!border-[#1a1a1a] [&:-webkit-autofill]:!transition-[background-color] [&:-webkit-autofill]:!duration-[999999s] [&:-webkit-autofill]:!delay-[999999s] [&:-webkit-autofill]:![-webkit-text-fill-color:white]"
            />
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
          </div>

          {/* Upload Button */}
          <div className="flex justify-center mt-8">
            <Button
              onClick={handleUpload}
              disabled={isUploadDisabled}
              loading={loading}
              variant={selectedFile ? "primary" : "secondary"}
              size="sm"
              className={cn(
                "w-40 h-8 text-center justify-center",
                selectedFile &&
                  "bg-[#F48120] hover:bg-[#F48120]/90 text-white border-[#F48120]",
                !selectedFile &&
                  "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed",
                uploadSuccess &&
                  !hasChanges &&
                  "bg-green-500 hover:bg-green-600 text-white border-green-500 cursor-not-allowed"
              )}
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
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
