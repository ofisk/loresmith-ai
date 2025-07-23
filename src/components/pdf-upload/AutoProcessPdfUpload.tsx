import type React from "react";
import { useCallback, useState } from "react";
import { useProcessingProgress } from "../../hooks/useProcessingProgress";
import { authenticatedFetchWithExpiration } from "../../lib/auth";
import { API_CONFIG } from "../../shared";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Input } from "../input/Input";
import { Loader } from "../loader/Loader";
import { ProcessingProgressBar } from "../progress/ProcessingProgressBar";
import { Textarea } from "../textarea/Textarea";

interface PdfMetadata {
  description?: string;
  tags?: string[];
  file_name?: string;
  file_size?: number;
}

interface SuggestedMetadata {
  description: string;
  tags: string[];
  suggestions: string[];
}

interface AutoProcessPdfUploadProps {
  onUploadComplete?: (fileKey: string, metadata: PdfMetadata) => void;
}

export function AutoProcessPdfUpload({
  onUploadComplete,
}: AutoProcessPdfUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [suggestedMetadata, setSuggestedMetadata] =
    useState<SuggestedMetadata | null>(null);
  const [metadata, setMetadata] = useState<PdfMetadata>({});
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const { progress, isProcessing, startProcessing, stopProcessing } =
    useProcessingProgress({
      onComplete: (success, error, suggestedMetadata) => {
        if (success && suggestedMetadata) {
          setSuggestedMetadata(suggestedMetadata);
          setMetadata((prev) => ({
            ...prev,
            description: suggestedMetadata.description,
            tags: suggestedMetadata.tags,
          }));
          setShowMetadataForm(true);
        } else if (error) {
          alert(`Processing failed: ${error}`);
        }
        setShowProgress(false);
      },
    });

  const uploadToR2 = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/pdf/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("user_auth_jwt")}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    return result.fileKey;
  }, []);

  const processPdfFromR2 = useCallback(
    async (fileKey: string, metadata: PdfMetadata) => {
      console.log("Calling processPdfFromR2 with:", { fileKey, metadata });

      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.PROCESS_PDF_FROM_R2),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileKey,
            metadata,
          }),
        }
      );

      console.log("Process PDF response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Processing failed:", response.status, errorText);
        throw new Error(`Processing failed: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as any;
      console.log("Process PDF result:", result);
      return result;
    },
    []
  );

  const updateMetadata = useCallback(
    async (fileKey: string, updates: Partial<PdfMetadata>) => {
      const { response } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.UPDATE_METADATA(fileKey)),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        throw new Error(`Metadata update failed: ${response.statusText}`);
      }

      return response.json();
    },
    []
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("Please select a PDF file");
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90));
        }, 100);

        // Upload to R2
        const uploadedFileKey = await uploadToR2(file);
        setFileKey(uploadedFileKey);
        setUploadProgress(100);

        clearInterval(progressInterval);

        // Start processing with progress tracking
        const initialMetadata: PdfMetadata = {
          file_name: file.name,
          file_size: file.size,
        };

        console.log("Starting PDF processing for:", uploadedFileKey);
        startProcessing(uploadedFileKey);
        setShowProgress(true);

        const processResult = await processPdfFromR2(
          uploadedFileKey,
          initialMetadata
        );
        console.log("Processing result:", processResult);

        // Processing completion is handled by the progress hook
        setMetadata(initialMetadata);
        onUploadComplete?.(uploadedFileKey, initialMetadata);
      } catch (error) {
        console.error("Upload/processing error:", error);
        alert(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [uploadToR2, processPdfFromR2, onUploadComplete, startProcessing]
  );

  const handleMetadataSubmit = useCallback(async () => {
    if (!fileKey) return;

    try {
      await updateMetadata(fileKey, {
        description: metadata.description,
        tags: metadata.tags,
      });

      setShowMetadataForm(false);
      onUploadComplete?.(fileKey, metadata);
    } catch (error) {
      console.error("Metadata update error:", error);
      alert(
        `Error updating metadata: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }, [fileKey, metadata, updateMetadata, onUploadComplete]);

  const handleAcceptSuggestions = useCallback(() => {
    if (suggestedMetadata) {
      setMetadata((prev) => ({
        ...prev,
        description: suggestedMetadata.description,
        tags: suggestedMetadata.tags,
      }));
      setShowMetadataForm(false);
      onUploadComplete?.(fileKey!, {
        ...metadata,
        description: suggestedMetadata.description,
        tags: suggestedMetadata.tags,
      });
    }
  }, [suggestedMetadata, metadata, fileKey, onUploadComplete]);

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {showProgress && progress && (
        <ProcessingProgressBar
          progress={progress}
          onClose={() => {
            setShowProgress(false);
            stopProcessing();
          }}
        />
      )}

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
          id="pdf-upload"
          disabled={isUploading || isProcessing}
        />
        <label htmlFor="pdf-upload" className="cursor-pointer block">
          <div className="space-y-2">
            {isUploading || isProcessing ? (
              <div className="space-y-2">
                <Loader className="mx-auto" />
                <p className="text-sm text-gray-600">
                  {isUploading
                    ? "Uploading PDF..."
                    : "Processing PDF with AI..."}
                </p>
                {isUploading && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">📄</div>
                <p className="text-lg font-medium">Upload PDF</p>
                <p className="text-sm text-gray-500">
                  Click to select a PDF file to upload and process
                </p>
              </>
            )}
          </div>
        </label>
      </div>

      {suggestedMetadata && showMetadataForm && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">
            AI-Generated Metadata Suggestions
          </h3>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium mb-1"
              >
                Description
              </label>
              <Textarea
                id="description"
                value={metadata.description || ""}
                onChange={(e) =>
                  setMetadata((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Enter description..."
                rows={3}
              />
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium mb-1">
                Tags
              </label>
              <Input
                id="tags"
                value={metadata.tags?.join(", ") || ""}
                onChange={(e) =>
                  setMetadata((prev) => ({
                    ...prev,
                    tags: e.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter((tag) => tag.length > 0),
                  }))
                }
                placeholder="Enter tags separated by commas..."
              />
            </div>

            {/* AI Suggestions */}
            {suggestedMetadata.suggestions &&
              suggestedMetadata.suggestions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">
                    AI Suggestions for Improvement:
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    {suggestedMetadata.suggestions.map((suggestion, index) => (
                      <li
                        key={`suggestion-${index}-${suggestion.substring(0, 20)}`}
                        className="flex items-start"
                      >
                        <span className="text-blue-600 mr-2">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex space-x-2">
              <Button onClick={handleAcceptSuggestions} variant="secondary">
                Accept Suggestions
              </Button>
              <Button onClick={handleMetadataSubmit}>Save Metadata</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
