import { useCallback, useState, useRef } from "react";
import { ERROR_MESSAGES } from "@/app-constants";
import {
  authenticatedFetchWithExpiration,
  getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";

export interface ResourceFile {
  id: string;
  file_key: string;
  file_name: string;
  display_name?: string;
  file_size: number;
  description?: string;
  tags?: string[] | string;
  status: string;
  created_at: string;
  updated_at: string;
  processing_error?: string; // JSON string containing error code and metadata
}

export interface ResourceFileWithCampaigns extends ResourceFile {
  campaigns?: Campaign[];
}

interface UseResourceFilesOptions {
  campaigns?: Campaign[];
}

interface UseResourceFilesReturn {
  files: ResourceFileWithCampaigns[];
  loading: boolean;
  error: string | null;
  fetchResources: () => Promise<void>;
  setFiles: React.Dispatch<React.SetStateAction<ResourceFileWithCampaigns[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook for managing resource file data and fetching
 */
export function useResourceFiles(
  options: UseResourceFilesOptions = {}
): UseResourceFilesReturn {
  const { campaigns = [] } = options;
  const [files, setFiles] = useState<ResourceFileWithCampaigns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchResourceCampaigns = useCallback(
    async (filesToProcess: ResourceFile[], userCampaigns: Campaign[] = []) => {
      try {
        const jwt = getStoredJwt();
        if (!jwt) {
          return;
        }

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
                resources: Array<{ file_key: string }>;
              };
              const resources = resourcesData.resources || [];
              const fileKeySet = new Set<string>(
                resources.map((r) => r.file_key)
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
          for (const file of filesToProcess) {
            if (fileKeySet.has(file.file_key)) {
              if (!fileKeyToCampaigns[file.file_key]) {
                fileKeyToCampaigns[file.file_key] = [];
              }
              fileKeyToCampaigns[file.file_key].push(campaign);
            }
          }
        }

        // Helper to safely parse tags from JSON string or return as-is
        const parseTags = (tags: string | string[] | undefined): string[] => {
          if (!tags) return [];
          if (Array.isArray(tags)) return tags;
          if (typeof tags === "string") {
            try {
              const parsed = JSON.parse(tags);
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Not valid JSON, treat as comma-separated string
              return tags
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            }
          }
          return [];
        };

        // Map files with campaigns and parse tags from JSON strings
        const filesWithCampaigns: ResourceFileWithCampaigns[] =
          filesToProcess.map((file) => ({
            ...file,
            campaigns: fileKeyToCampaigns[file.file_key] || [],
            tags: parseTags(file.tags),
          }));

        setFiles(filesWithCampaigns);
      } catch (err) {
        console.error("Failed to fetch resource campaigns:", err);
        setError("Failed to fetch resource campaigns");
      }
    },
    []
  );

  const fetchResources = useCallback(async () => {
    try {
      if (isFetchingRef.current) {
        return;
      }

      const jwt = getStoredJwt();
      if (!jwt) {
        setError(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
        setLoading(false);
        return;
      }

      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

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

      const fetchedFiles = resourcesData.files || [];
      await fetchResourceCampaigns(fetchedFiles, campaigns);
    } catch (err) {
      console.error("Failed to fetch resources:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch resources"
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetchResourceCampaigns, campaigns]);

  return {
    files,
    loading,
    error,
    fetchResources,
    setFiles,
    setError,
    setLoading,
  };
}
