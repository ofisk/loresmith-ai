import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";
import { API_CONFIG } from "../../shared";
import { AddResourceModal } from "../campaign/AddResourceModal";
import { useCampaigns } from "../../hooks/useCampaigns";
import type { PdfFile } from "../../types/campaign";

interface PdfListProps {
  className?: string;
  jwt: string | null;
}

export function PdfList({ className, jwt }: PdfListProps) {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | null>(null);
  const { campaigns, loading: campaignsLoading } = useCampaigns();

  const fetchFiles = useCallback(async () => {
    if (!jwt) {
      setFiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`);
      }

      const data = (await response.json()) as { files: PdfFile[] };
      // Filter out .metadata files which are internal files
      const filteredFiles = (data.files || []).filter(
        (file) => !file.fileName.endsWith(".metadata")
      );
      setFiles(filteredFiles);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch PDF files"
      );
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleAddToCampaign = (pdf: PdfFile) => {
    setSelectedPdf(pdf);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedPdf(null);
  };

  const handleResourceAdded = () => {
    // Refresh the files list after adding a resource
    fetchFiles();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  if (!jwt) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Show Resources</h3>
          <p className="text-ob-base-200 text-sm">
            Please authenticate to view your uploaded resources.
          </p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Show Resources</h3>
          <p className="text-ob-base-200 text-sm">Loading resources...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Show Resources</h3>
          <p className="text-ob-destructive text-sm">Error: {error}</p>
          <Button onClick={fetchFiles} variant="secondary" size="sm">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Show Resources</h3>
          <p className="text-ob-base-200 text-sm">
            {files.length === 0
              ? "No PDF files uploaded yet."
              : `${files.length} PDF file${files.length === 1 ? "" : "s"} uploaded`}
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.fileKey}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-md"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div>
                    <div className="font-medium text-ob-base-300">
                      {file.fileName}
                    </div>
                    <div className="text-sm text-ob-base-200">
                      {formatFileSize(file.fileSize)} • {file.status} •{" "}
                      {new Date(file.uploaded).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => handleAddToCampaign(file)}
                  variant="secondary"
                  size="sm"
                  disabled={campaignsLoading || campaigns.length === 0}
                >
                  Add to Campaign
                </Button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && campaigns.length === 0 && !campaignsLoading && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              No campaigns available. Create a campaign first to add PDFs.
            </p>
          </div>
        )}
      </Card>

      {selectedPdf && (
        <AddResourceModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onAddResource={handleResourceAdded}
          campaignId=""
          pdf={selectedPdf}
          campaigns={campaigns}
        />
      )}
    </>
  );
}
