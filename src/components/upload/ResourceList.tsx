import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ERROR_MESSAGES } from "../../app-constants";
import type { AutoRAGEvent, FileUploadEvent } from "../../lib/event-bus";
import { EVENT_TYPES, useEventBus } from "../../lib/event-bus";
import {
  AuthService,
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";
import type { Campaign } from "../../types/campaign";
import { Button } from "../button/Button";
import { FileStatusIndicator } from "./FileStatusIndicator";

interface ResourceListProps {
  onAddToCampaign?: (file: any) => void;
  onEditFile?: (file: any) => void;
}

interface ResourceFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description?: string;
  tags?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ResourceFileWithCampaigns extends ResourceFile {
  campaigns?: Campaign[];
}

function getDisplayName(filename: string | undefined | null): string {
  if (!filename) {
    return "Unknown file";
  }
  return filename;
}

export function ResourceList({
  onAddToCampaign,
  onEditFile,
}: ResourceListProps) {
  const [files, setFiles] = useState<ResourceFileWithCampaigns[]>([]);
  const [_campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local progress map keyed by fileKey; 0..100
  const [progressByFileKey, setProgressByFileKey] = useState<
    Record<string, number>
  >({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const refreshTimerRef = useRef<number | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchResourceCampaigns = useCallback(async (files: ResourceFile[]) => {
    try {
      const jwt = getStoredJwt();

      // Fetch campaigns once
      const { response: campaignsResponse, jwtExpired: campaignsJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
          { jwt }
        );

      if (campaignsJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!campaignsResponse.ok) {
        throw new Error(
          `Failed to fetch campaigns: ${campaignsResponse.status}`
        );
      }

      const campaignsData = (await campaignsResponse.json()) as {
        campaigns: Campaign[];
      };
      const userCampaigns = campaignsData.campaigns || [];

      // Fetch each campaign's resources once
      const resourcesByCampaign = await Promise.all(
        userCampaigns.map(async (campaign) => {
          try {
            const {
              response: resourcesResponse,
              jwtExpired: resourcesJwtExpired,
            } = await authenticatedFetchWithExpiration(
              API_CONFIG.buildUrl(
                API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaign.campaignId)
              ),
              { jwt }
            );
            if (resourcesJwtExpired) {
              throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
            }
            if (!resourcesResponse.ok) {
              throw new Error(
                `Failed to fetch campaign resources: ${resourcesResponse.status}`
              );
            }
            const resourcesData = (await resourcesResponse.json()) as {
              resources: any[];
            };
            const resources = resourcesData.resources || [];
            const fileKeySet = new Set<string>(
              resources.map((r: any) => r.file_key)
            );
            return { campaign, fileKeySet };
          } catch (_e) {
            return { campaign, fileKeySet: new Set<string>() };
          }
        })
      );

      // Build mapping: file_key -> campaigns[]
      const fileKeyToCampaigns: Record<string, Campaign[]> = {};
      for (const { campaign, fileKeySet } of resourcesByCampaign) {
        for (const file of files) {
          if (fileKeySet.has(file.file_key)) {
            if (!fileKeyToCampaigns[file.file_key]) {
              fileKeyToCampaigns[file.file_key] = [];
            }
            fileKeyToCampaigns[file.file_key].push(campaign);
          }
        }
      }

      // Map files with campaigns
      const filesWithCampaigns: ResourceFileWithCampaigns[] = files.map(
        (file) => ({
          ...file,
          campaigns: fileKeyToCampaigns[file.file_key] || [],
        })
      );

      setFiles(filesWithCampaigns);
      setCampaigns(userCampaigns);
    } catch (err) {
      console.error("Failed to fetch resource campaigns:", err);
      setError("Failed to fetch resource campaigns");
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        return;
      }

      const { response: campaignsResponse, jwtExpired: campaignsJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
          { jwt }
        );

      if (campaignsJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!campaignsResponse.ok) {
        throw new Error(
          `Failed to fetch campaigns: ${campaignsResponse.status}`
        );
      }

      const campaignsData = (await campaignsResponse.json()) as {
        campaigns: Campaign[];
      };

      setCampaigns(campaignsData.campaigns || []);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    }
  }, []);

  const fetchResources = useCallback(async () => {
    try {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      // Wait for JWT to be available (with retry mechanism)
      let jwt = getStoredJwt();
      let retries = 0;
      const maxRetries = 10;

      while (!jwt && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        jwt = getStoredJwt();
        retries++;
      }

      if (!jwt) {
        setError(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
        return;
      }

      const { response: resourcesResponse, jwtExpired: resourcesJwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
          { jwt }
        );

      if (resourcesJwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!resourcesResponse.ok) {
        throw new Error(
          `Failed to fetch resources: ${resourcesResponse.status}`
        );
      }

      const resourcesData = (await resourcesResponse.json()) as {
        files: ResourceFile[];
      };

      const files = resourcesData.files || [];
      await fetchResourceCampaigns(files);
    } catch (err) {
      console.error("Failed to fetch resources:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch resources"
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetchResourceCampaigns]);

  const scheduleRefresh = useCallback(
    (delay = 300) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        fetchResources();
        refreshTimerRef.current = null;
      }, delay);
    },
    [fetchResources]
  );

  const handleEditFile = (file: ResourceFileWithCampaigns) => {
    onEditFile?.(file);
  };

  const toggleFileExpansion = (fileKey: string) => {
    const newExpandedFiles = new Set(expandedFiles);
    if (newExpandedFiles.has(fileKey)) {
      newExpandedFiles.delete(fileKey);
    } else {
      newExpandedFiles.add(fileKey);
    }
    setExpandedFiles(newExpandedFiles);
  };

  useEffect(() => {
    fetchResources();
    fetchCampaigns();
  }, [fetchResources, fetchCampaigns]);

  // Listen for file upload completed: refresh list and finalize/clear progress bar
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.COMPLETED,
    (event) => {
      const key = event.fileKey;
      if (key) {
        // Snap to 100% then clear shortly after
        setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
        setTimeout(() => {
          setProgressByFileKey((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
          });
        }, 1200);
      }
      scheduleRefresh(200);
    },
    [scheduleRefresh]
  );

  // Upload progress listeners
  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.STARTED,
    (event) => {
      const key = event.fileKey;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 0 }));
    },
    []
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.PROGRESS,
    (event) => {
      const key = event.fileKey;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      setProgressByFileKey((prev) => ({ ...prev, [key]: pct }));
    },
    []
  );

  useEventBus<FileUploadEvent>(
    EVENT_TYPES.FILE_UPLOAD.FAILED,
    (event) => {
      const key = event.fileKey;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      // Clear after a short delay to reflect failure via status badge
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  // Indexing progress listeners
  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.STARTED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 0 }));
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.PROGRESS,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      const pct = Math.max(0, Math.min(100, event.progress ?? 0));
      setProgressByFileKey((prev) => ({ ...prev, [key]: pct }));
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.FAILED,
    (event) => {
      const key = event.fileKey as string | undefined;
      if (!key) return;
      setProgressByFileKey((prev) => ({ ...prev, [key]: 100 }));
      setTimeout(() => {
        setProgressByFileKey((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    },
    []
  );

  useEventBus<AutoRAGEvent>(
    EVENT_TYPES.AUTORAG_SYNC.COMPLETED,
    (event) => {
      console.log(
        "[ResourceList] AutoRAG sync completed, refreshing resource list:",
        event
      );
      scheduleRefresh(200);
    },
    [scheduleRefresh]
  );

  // When files list updates, clear any lingering progress entries for files
  // that are no longer processing (e.g., completed or error)
  useEffect(() => {
    if (!files || files.length === 0) return;
    setProgressByFileKey((prev) => {
      const activeProcessingKeys = new Set(
        files.filter((f) => f.status === "processing").map((f) => f.file_key)
      );
      // Remove entries for keys not actively processing
      let changed = false;
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (activeProcessingKeys.has(k)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  // Listen for file change events from the AI agent
  useEffect(() => {
    const handleFileChange = (event: CustomEvent) => {
      if (event.detail?.type === "file-changed") {
        scheduleRefresh(200);
      }
    };

    // Listen for custom file change events
    window.addEventListener("file-changed", handleFileChange as EventListener);

    return () => {
      window.removeEventListener(
        "file-changed",
        handleFileChange as EventListener
      );
    };
  }, [scheduleRefresh]);

  // Listen for file status update events from FileStatusIndicator
  useEffect(() => {
    const handleFileStatusUpdate = (event: CustomEvent) => {
      if (event.detail?.updatedCount > 0) {
        scheduleRefresh(200);
      }
    };

    // Listen for file status update events
    window.addEventListener(
      "file-status-updated",
      handleFileStatusUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "file-status-updated",
        handleFileStatusUpdate as EventListener
      );
    };
  }, [scheduleRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading resources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">{error}</div>
        <Button
          onClick={fetchResources}
          variant="secondary"
          size="sm"
          className="mx-auto"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-2">The shelves lie bare</div>
        <p className="text-sm text-gray-400">
          Place a scroll upon the archive to awaken it
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.file_key}
            className="relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800 overflow-hidden"
          >
            {/* Progress fill (transparent overlay) */}
            <div
              className="absolute inset-y-0 left-0 pointer-events-none"
              style={{
                width: (() => {
                  const pct = progressByFileKey[file.file_key];
                  if (typeof pct === "number") return `${pct}%`;
                  if (file.status === "processing") return "66%";
                  if (file.status === "error") return "100%";
                  return undefined;
                })(),
                transition: "width 300ms ease",
                background:
                  file.status === "error"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(147,197,253,0.12)",
              }}
            />
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help">
                    {getDisplayName(file.file_name)}
                  </h4>
                  {AuthService.getUsernameFromStoredJwt() && (
                    <FileStatusIndicator
                      tenant={AuthService.getUsernameFromStoredJwt()!}
                      initialStatus={file.status}
                      className="flex-shrink-0"
                    />
                  )}
                </div>
                <button
                  onClick={() => toggleFileExpansion(file.file_key)}
                  type="button"
                  className="flex-shrink-0 p-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
                >
                  {expandedFiles.has(file.file_key) ? (
                    <CaretDownIcon size={16} className="text-purple-600" />
                  ) : (
                    <CaretRightIcon size={16} className="text-purple-600" />
                  )}
                </button>
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  expandedFiles.has(file.file_key)
                    ? "max-h-96 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-4 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Uploaded:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {new Date(file.created_at)
                        .toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "2-digit",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })
                        .replace(",", "")
                        .replace(" PM", "p")
                        .replace(" AM", "a")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      Size:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {file.file_size
                        ? (file.file_size / 1024 / 1024).toFixed(2)
                        : "Unknown"}{" "}
                      MB
                    </span>
                  </div>
                </div>

                {file.description && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {file.description}
                    </p>
                  </div>
                )}
                {file.tags && file.tags.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {file.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {file.campaigns && file.campaigns.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Linked campaigns:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {file.campaigns.map((campaign) => (
                        <span
                          key={campaign.campaignId}
                          className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
                        >
                          {campaign.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <Button
                    onClick={() => {
                      onAddToCampaign?.(file);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
                  >
                    Add to campaign
                  </Button>
                  <Button
                    onClick={() => {
                      handleEditFile(file);
                    }}
                    variant="secondary"
                    size="sm"
                    className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
