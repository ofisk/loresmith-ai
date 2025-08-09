import { useState, useEffect, useCallback } from "react";
import { CaretDown, CaretRight, Upload, FileText } from "@phosphor-icons/react";
import { Card } from "../card/Card";
import { Button } from "../button/Button";
import { PdfUploadAgent } from "../pdf-upload/PdfUploadAgent";

interface PdfFile {
  file_key: string;
  file_name: string;
  description?: string;
  tags?: string[];
  file_size?: number;
  chunk_count?: number;
  created_at: string;
  campaigns?: Array<{ id: string; name: string }>;
}

interface ResourceSidePanelProps {
  className?: string;
}

export function ResourceSidePanel({ className = "" }: ResourceSidePanelProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(true);
  const [resources, setResources] = useState<PdfFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchResources = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/pdf/list");
      if (response.ok) {
        const data = (await response.json()) as { files?: PdfFile[] };
        setResources(data.files || []);
      }
    } catch (error) {
      console.error("Failed to fetch resources:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div
      className={`w-80 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-300 dark:border-neutral-800">
        <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
          Resources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your campaign content
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsUploadOpen(!isUploadOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-purple-500" />
              <span className="font-medium">Upload resources</span>
            </div>
            {isUploadOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>

          {isUploadOpen && (
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
              <PdfUploadAgent />
            </div>
          )}
        </Card>

        {/* Resources Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsResourcesOpen(!isResourcesOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your resources</span>
              <span className="text-sm text-gray-500">
                ({resources.length})
              </span>
            </div>
            {isResourcesOpen ? (
              <CaretDown size={16} />
            ) : (
              <CaretRight size={16} />
            )}
          </button>

          {isResourcesOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700">
              {isLoading ? (
                <div className="p-3 text-sm text-gray-500">
                  Loading resources...
                </div>
              ) : resources.length === 0 ? (
                <div className="p-3 text-sm text-gray-500 text-center">
                  No resources uploaded yet. Use the upload section above to add
                  your first resource! 📄
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {resources.map((resource) => (
                    <div
                      key={resource.file_key}
                      className="p-3 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <div className="space-y-2">
                        {/* File Name */}
                        <div
                          className="font-medium text-sm truncate"
                          title={resource.file_name}
                        >
                          📄 {resource.file_name}
                        </div>

                        {/* Metadata */}
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div>Size: {formatFileSize(resource.file_size)}</div>
                          <div>Uploaded: {formatDate(resource.created_at)}</div>
                          {resource.chunk_count && (
                            <div>Chunks: {resource.chunk_count}</div>
                          )}
                          {resource.campaigns &&
                            resource.campaigns.length > 0 && (
                              <div>
                                Campaigns:{" "}
                                {resource.campaigns
                                  .map((c) => c.name)
                                  .join(", ")}
                              </div>
                            )}
                        </div>

                        {/* Description */}
                        {resource.description && (
                          <div className="text-xs text-gray-700 dark:text-gray-300 italic">
                            "{resource.description}"
                          </div>
                        )}

                        {/* Tags */}
                        {resource.tags && resource.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {resource.tags.map((tag, index) => (
                              <span
                                key={`${resource.file_key}-tag-${index}`}
                                className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh Button */}
              <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchResources}
                  className="w-full"
                  disabled={isLoading}
                >
                  🔄 Refresh resources
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
