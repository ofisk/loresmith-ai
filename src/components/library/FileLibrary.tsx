// File library component for browsing and searching uploaded files
// Includes search, metadata editing, and file operations

import type React from "react";
import { useCallback, useEffect, useState, useId } from "react";
import { API_CONFIG } from "../../shared";
import { JWT_STORAGE_KEY } from "../../constants";
import type { SearchResult } from "../../types/upload";

interface FileLibraryProps {
  onFileSelect?: (file: SearchResult) => void;
  onFileDelete?: (fileId: string) => void;
}

export const FileLibrary: React.FC<FileLibraryProps> = ({
  onFileSelect,
  onFileDelete,
}) => {
  const descriptionId = useId();
  const tagsId = useId();
  const [files, setFiles] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [_selectedFile, setSelectedFile] = useState<SearchResult | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<{
    fileId: string;
    description: string;
    tags: string[];
  } | null>(null);

  const fetchFiles = useCallback(async (query = "") => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.append("q", query);
      params.append("limit", "50");

      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/library/search?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFiles((data as any).results || []);
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchFiles = useCallback(async () => {
    await fetchFiles(searchQuery);
  }, [searchQuery, fetchFiles]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      searchFiles();
    },
    [searchFiles]
  );

  const handleFileClick = useCallback(
    (file: SearchResult) => {
      setSelectedFile(file);
      onFileSelect?.(file);
    },
    [onFileSelect]
  );

  const handleDownload = useCallback(async (fileId: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/library/files/${fileId}/download`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        window.open((data as any).downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  }, []);

  const handleDelete = useCallback(
    async (fileId: string) => {
      if (!confirm("Are you sure you want to delete this file?")) return;

      try {
        const response = await fetch(
          `${API_CONFIG.getApiBaseUrl()}/library/files/${fileId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
            },
          }
        );

        if (response.ok) {
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          onFileDelete?.(fileId);
        }
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    },
    [onFileDelete]
  );

  const handleEditMetadata = useCallback((file: SearchResult) => {
    setEditingMetadata({
      fileId: file.id,
      description: file.description || "",
      tags: file.tags || [],
    });
  }, []);

  const handleSaveMetadata = useCallback(async () => {
    if (!editingMetadata) return;

    try {
      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/library/files/${editingMetadata.fileId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
          body: JSON.stringify({
            description: editingMetadata.description,
            tags: editingMetadata.tags,
          }),
        }
      );

      if (response.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === editingMetadata.fileId
              ? {
                  ...f,
                  description: editingMetadata.description,
                  tags: editingMetadata.tags,
                }
              : f
          )
        );
        setEditingMetadata(null);
      }
    } catch (error) {
      console.error("Failed to update metadata:", error);
    }
  }, [editingMetadata]);

  const handleRegenerateMetadata = useCallback(async (fileId: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/library/files/${fileId}/regenerate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  description: (data as any).metadata.description,
                  tags: (data as any).metadata.tags,
                }
              : f
          )
        );
      }
    } catch (error) {
      console.error("Failed to regenerate metadata:", error);
    }
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      {/* Search Bar */}
      <div className="mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files by name, description, or tags..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      {/* File Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {files.map((file) => (
          <button
            key={file.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer text-left w-full"
            onClick={() => handleFileClick(file)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleFileClick(file);
              }
            }}
            type="button"
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-medium text-gray-900 truncate flex-1">
                {file.filename}
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(file.id);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file.id);
                  }}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>

            {file.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {file.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1 mb-3">
              {file.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>{formatFileSize(file.fileSize)}</span>
              <span>{formatDate(file.createdAt)}</span>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditMetadata(file);
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRegenerateMetadata(file.id);
                }}
                className="text-sm text-green-600 hover:text-green-800"
              >
                Regenerate
              </button>
            </div>
          </button>
        ))}
      </div>

      {files.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📁</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No files found
          </h3>
          <p className="text-gray-500">
            {searchQuery
              ? "Try adjusting your search terms."
              : "Upload some files to get started."}
          </p>
        </div>
      )}

      {/* Metadata Edit Modal */}
      {editingMetadata && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Edit File Metadata</h3>

            <div className="mb-4">
              <label
                htmlFor={descriptionId}
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Description
              </label>
              <textarea
                id={descriptionId}
                value={editingMetadata.description}
                onChange={(e) =>
                  setEditingMetadata({
                    ...editingMetadata,
                    description: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor={tagsId}
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tags (comma-separated)
              </label>
              <input
                id={tagsId}
                type="text"
                value={editingMetadata.tags.join(", ")}
                onChange={(e) =>
                  setEditingMetadata({
                    ...editingMetadata,
                    tags: e.target.value.split(",").map((tag) => tag.trim()),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveMetadata}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingMetadata(null)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
