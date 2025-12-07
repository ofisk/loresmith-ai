import { useMemo, useState } from "react";
import { USER_MESSAGES } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";
import type {
  SessionDigestWithData,
  CreateSessionDigestInput,
  UpdateSessionDigestInput,
} from "@/types/session-digest";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";

/**
 * Hook for managing session digest operations
 *
 * @example
 * ```typescript
 * const {
 *   digests,
 *   loading,
 *   error,
 *   fetchSessionDigests,
 *   createSessionDigest,
 *   updateSessionDigest,
 *   deleteSessionDigest,
 * } = useSessionDigests();
 *
 * // Fetch all digests for a campaign
 * await fetchSessionDigests("campaign-id");
 *
 * // Create a new digest
 * await createSessionDigest("campaign-id", {
 *   sessionNumber: 1,
 *   sessionDate: "2024-01-01",
 *   digestData: { ... }
 * });
 * ```
 */
export function useSessionDigests() {
  const [digests, setDigests] = useState<SessionDigestWithData[]>([]);
  const [currentDigest, setCurrentDigest] =
    useState<SessionDigestWithData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { makeRequestWithData } = useAuthenticatedRequest();

  // Fetch all session digests for a campaign
  const fetchSessionDigests = useBaseAsync(
    useMemo(
      () => async (campaignId: string) => {
        const data = await makeRequestWithData<{
          digests: SessionDigestWithData[];
        }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(campaignId)
          )
        );
        return data.digests || [];
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (digests: SessionDigestWithData[]) => {
          setDigests(digests);
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_SESSION_DIGESTS,
      }),
      []
    )
  );

  // Fetch a single session digest
  const fetchSessionDigest = useBaseAsync(
    useMemo(
      () => async (campaignId: string, digestId: string) => {
        const data = await makeRequestWithData<{
          digest: SessionDigestWithData;
        }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
              campaignId,
              digestId
            )
          )
        );
        return data.digest;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (digest: SessionDigestWithData) => {
          setCurrentDigest(digest);
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_SESSION_DIGEST,
      }),
      []
    )
  );

  // Create a new session digest
  const createSessionDigest = useBaseAsync(
    useMemo(
      () =>
        async (
          campaignId: string,
          input: Omit<CreateSessionDigestInput, "campaignId">
        ) => {
          const data = await makeRequestWithData<{
            digest: SessionDigestWithData;
          }>(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.BASE(campaignId)
            ),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sessionNumber: input.sessionNumber,
                sessionDate: input.sessionDate || null,
                digestData: input.digestData,
              }),
            }
          );
          return data.digest;
        },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (digest: SessionDigestWithData) => {
          setDigests((prev) =>
            [...prev, digest].sort((a, b) => {
              if (a.sessionNumber !== b.sessionNumber) {
                return b.sessionNumber - a.sessionNumber;
              }
              return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
              );
            })
          );
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_CREATE_SESSION_DIGEST,
      }),
      []
    )
  );

  // Update a session digest
  const updateSessionDigest = useBaseAsync(
    useMemo(
      () =>
        async (
          campaignId: string,
          digestId: string,
          input: UpdateSessionDigestInput
        ) => {
          const data = await makeRequestWithData<{
            digest: SessionDigestWithData;
          }>(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
                campaignId,
                digestId
              )
            ),
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
            }
          );
          return data.digest;
        },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (digest: SessionDigestWithData) => {
          setDigests((prev) =>
            prev
              .map((d) => (d.id === digest.id ? digest : d))
              .sort((a, b) => {
                if (a.sessionNumber !== b.sessionNumber) {
                  return b.sessionNumber - a.sessionNumber;
                }
                return (
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
                );
              })
          );
          if (currentDigest?.id === digest.id) {
            setCurrentDigest(digest);
          }
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_UPDATE_SESSION_DIGEST,
      }),
      [currentDigest]
    )
  );

  // Delete a session digest
  const deleteSessionDigest = useBaseAsync(
    useMemo(
      () => async (campaignId: string, digestId: string) => {
        await makeRequestWithData(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.SESSION_DIGESTS.DETAILS(
              campaignId,
              digestId
            )
          ),
          {
            method: "DELETE",
          }
        );
        return digestId;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (digestId: string) => {
          setDigests((prev) => prev.filter((d) => d.id !== digestId));
          if (currentDigest?.id === digestId) {
            setCurrentDigest(null);
          }
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_DELETE_SESSION_DIGEST,
      }),
      [currentDigest]
    )
  );

  return {
    // State
    digests,
    currentDigest,
    loading:
      fetchSessionDigests.loading ||
      fetchSessionDigest.loading ||
      createSessionDigest.loading ||
      updateSessionDigest.loading ||
      deleteSessionDigest.loading,
    error:
      error ||
      fetchSessionDigests.error ||
      fetchSessionDigest.error ||
      createSessionDigest.error ||
      updateSessionDigest.error ||
      deleteSessionDigest.error,

    // Actions
    fetchSessionDigests: {
      execute: fetchSessionDigests.execute,
      loading: fetchSessionDigests.loading,
    },
    fetchSessionDigest: {
      execute: fetchSessionDigest.execute,
      loading: fetchSessionDigest.loading,
    },
    createSessionDigest: {
      execute: createSessionDigest.execute,
      loading: createSessionDigest.loading,
    },
    updateSessionDigest: {
      execute: updateSessionDigest.execute,
      loading: updateSessionDigest.loading,
    },
    deleteSessionDigest: {
      execute: deleteSessionDigest.execute,
      loading: deleteSessionDigest.loading,
    },

    // Utilities
    refetch: (campaignId: string) => {
      fetchSessionDigests.execute(campaignId);
    },
    reset: () => {
      setDigests([]);
      setCurrentDigest(null);
      setError(null);
    },
    setError,
  };
}
