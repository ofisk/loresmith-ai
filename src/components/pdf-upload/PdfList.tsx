import { useCallback, useEffect, useState } from "react";
import { authenticatedFetchWithExpiration } from "../../lib/auth";
import { API_CONFIG } from "../../shared";
import { USER_MESSAGES, ERROR_MESSAGES } from "../../constants";

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

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES)
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
            className="p-4 border rounded-lg bg-white shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{file.fileName}</h4>
                <p className="text-sm text-gray-500">
                  Size: {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-sm text-gray-500">Status: {file.status}</p>
                <p className="text-sm text-gray-500">
                  Uploaded: {new Date(file.uploaded).toLocaleDateString()}
                </p>
                {file.metadata?.description && (
                  <p className="text-sm text-gray-600 mt-2">
                    {file.metadata.description}
                  </p>
                )}
                {file.metadata?.tags && file.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {file.metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
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
