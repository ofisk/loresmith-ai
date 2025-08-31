import { useCallback, useState } from "react";
import { API_CONFIG } from "../shared";
import type { StagedSnippetGroup } from "../types/campaign";

interface CampaignSnippetManagementState {
  stagedSnippets: StagedSnippetGroup[];
  loading: boolean;
  error: string | null;
  processing: string | null;
  refreshing: boolean;
}

export function useCampaignSnippetManagement(campaignId: string) {
  const [state, setState] = useState<CampaignSnippetManagementState>({
    stagedSnippets: [],
    loading: false,
    error: null,
    processing: null,
    refreshing: false,
  });

  // Update state with partial updates
  const updateState = useCallback(
    (updates: Partial<CampaignSnippetManagementState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Fetch staged snippets
  const fetchStagedSnippets = useCallback(async () => {
    try {
      updateState({ loading: true, error: null });

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SNIPPETS(
            campaignId
          )
        ),
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("jwt")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch staged snippets: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        snippets?: StagedSnippetGroup[];
      };
      updateState({ stagedSnippets: data.snippets || [] });
    } catch (err) {
      console.error("Error fetching staged snippets:", err);
      updateState({
        error: err instanceof Error ? err.message : "Failed to fetch snippets",
      });
    } finally {
      updateState({ loading: false });
    }
  }, [campaignId, updateState]);

  // Approve snippets
  const approveSnippets = async (stagingKey: string) => {
    try {
      updateState({ processing: stagingKey });

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.APPROVE_SNIPPETS(
            campaignId
          )
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("jwt")}`,
          },
          body: JSON.stringify({
            stagingKey,
            expansions: [], // Optional expansions can be added later
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to approve snippets: ${response.statusText}`);
      }

      // Remove the approved snippet group from the list
      updateState({
        stagedSnippets: state.stagedSnippets.filter(
          (group) => group.key !== stagingKey
        ),
      });
    } catch (err) {
      console.error("Error approving snippets:", err);
      updateState({
        error:
          err instanceof Error ? err.message : "Failed to approve snippets",
      });
    } finally {
      updateState({ processing: null });
    }
  };

  // Reject snippets
  const rejectSnippets = async (stagingKey: string, reason: string) => {
    try {
      updateState({ processing: stagingKey });

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.REJECT_SNIPPETS(
            campaignId
          )
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("jwt")}`,
          },
          body: JSON.stringify({
            stagingKey,
            reason,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to reject snippets: ${response.statusText}`);
      }

      // Remove the rejected snippet group from the list
      updateState({
        stagedSnippets: state.stagedSnippets.filter(
          (group) => group.key !== stagingKey
        ),
      });
    } catch (err) {
      console.error("Error rejecting snippets:", err);
      updateState({
        error: err instanceof Error ? err.message : "Failed to reject snippets",
      });
    } finally {
      updateState({ processing: null });
    }
  };

  // Refresh snippets
  const refreshSnippets = async () => {
    try {
      updateState({ refreshing: true, error: null });
      await fetchStagedSnippets();
    } catch (err) {
      console.error("Error refreshing snippets:", err);
      updateState({
        error:
          err instanceof Error ? err.message : "Failed to refresh snippets",
      });
    } finally {
      updateState({ refreshing: false });
    }
  };

  return {
    // State
    ...state,

    // Actions
    fetchStagedSnippets,
    approveSnippets,
    rejectSnippets,
    refreshSnippets,
  };
}
