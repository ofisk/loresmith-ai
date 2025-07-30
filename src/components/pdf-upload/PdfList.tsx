import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES, USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration, getStoredJwt } from "../../lib/auth";
import { API_CONFIG } from "../../shared";

interface PdfFile {
  fileKey: string;
  fileName: string;
  fileSize: number;
  uploaded: string;
  status: string;
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export function PdfList() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const jwt = getStoredJwt();
      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
        { jwt }
      );

      if (jwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`);
      }

      const data = (await response.json()) as { files: PdfFile[] };
      setFiles(data.files || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.FAILED_TO_RETRIEVE_FILES
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  if (loading) {
    return <div>Loading PDF files...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No PDF files uploaded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Uploaded PDF Files</h3>
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.fileKey}
            className="p-4 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {file.fileName}
                </h4>
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <span>
                    Size: {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <span>•</span>
                  <span>
                    Uploaded: {new Date(file.uploaded).toLocaleString()}
                  </span>
                </div>
                {file.metadata?.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                    {file.metadata.description}
                  </p>
                )}
                {file.metadata?.tags && file.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {file.metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
