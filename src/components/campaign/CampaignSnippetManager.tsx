import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../../shared";
import { JWT_STORAGE_KEY } from "../../constants";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Loader } from "../loader/Loader";
import type { StagedSnippetGroup } from "../../types/snippet";

interface CampaignSnippetManagerProps {
  campaignId: string;
  onSnippetsUpdated?: () => void;
}

export const CampaignSnippetManager: React.FC<CampaignSnippetManagerProps> = ({
  campaignId,
  onSnippetsUpdated,
}) => {
  const [stagedSnippets, setStagedSnippets] = useState<StagedSnippetGroup[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch staged snippets
  const fetchStagedSnippets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.STAGED_SNIPPETS(
            campaignId
          )
        ),
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
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
      setStagedSnippets(data.snippets || []);
    } catch (err) {
      console.error("Error fetching staged snippets:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch snippets");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Approve snippets
  const approveSnippets = async (stagingKey: string) => {
    try {
      setProcessing(stagingKey);

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
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
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
      setStagedSnippets((prev) =>
        prev.filter((group) => group.key !== stagingKey)
      );

      // Notify parent component
      onSnippetsUpdated?.();
    } catch (err) {
      console.error("Error approving snippets:", err);
      setError(
        err instanceof Error ? err.message : "Failed to approve snippets"
      );
    } finally {
      setProcessing(null);
    }
  };

  // Reject snippets
  const rejectSnippets = async (stagingKey: string, reason: string) => {
    try {
      setProcessing(stagingKey);

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
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
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
      setStagedSnippets((prev) =>
        prev.filter((group) => group.key !== stagingKey)
      );

      // Notify parent component
      onSnippetsUpdated?.();
    } catch (err) {
      console.error("Error rejecting snippets:", err);
      setError(
        err instanceof Error ? err.message : "Failed to reject snippets"
      );
    } finally {
      setProcessing(null);
    }
  };

  // Load snippets on component mount
  useEffect(() => {
    fetchStagedSnippets();
  }, [fetchStagedSnippets]);

  // Listen for resource-added-to-campaign events to refresh snippets
  useEffect(() => {
    const handleResourceAdded = (event: CustomEvent) => {
      const { campaignIds, fileKey, fileName } = event.detail;

      // Check if this snippet manager is for one of the affected campaigns
      if (campaignIds.includes(campaignId)) {
        console.log(
          `[CampaignSnippetManager] Resource added to campaign ${campaignId}, refreshing snippets...`,
          {
            fileKey,
            fileName,
            campaignIds,
          }
        );

        // Wait a bit for snippets to be generated, then refresh
        setTimeout(() => {
          setRefreshing(true);
          fetchStagedSnippets().finally(() => {
            setRefreshing(false);
          });
        }, 2000); // 2 second delay to allow snippet generation to complete
      }
    };

    // Listen for custom resource-added-to-campaign events
    window.addEventListener(
      "resource-added-to-campaign",
      handleResourceAdded as EventListener
    );

    return () => {
      window.removeEventListener(
        "resource-added-to-campaign",
        handleResourceAdded as EventListener
      );
    };
  }, [campaignId, fetchStagedSnippets]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <Button
          onClick={fetchStagedSnippets}
          className="mt-2"
          variant="secondary"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (stagedSnippets.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No staged snippets found for this campaign.</p>
        <p className="text-sm mt-2">
          Snippets will appear here after files are added to the campaign and
          processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Staged Snippets</h3>
        <div className="flex space-x-2">
          <Button onClick={fetchStagedSnippets} variant="secondary" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {refreshing && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-700 text-sm">
            🔄 Refreshing snippets... New snippets may appear shortly.
          </p>
        </div>
      )}

      {stagedSnippets.map((group) => (
        <Card key={group.key} className="p-6">
          <div className="mb-4">
            <h4 className="font-medium text-gray-900">
              From: {group.sourceRef.meta.fileName}
            </h4>
            <p className="text-sm text-gray-500">
              Generated on: {new Date(group.created_at).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">
              {group.snippets.length} snippet
              {group.snippets.length !== 1 ? "s" : ""} found
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {group.snippets.map((snippet) => (
              <div
                key={snippet.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {snippet.metadata.entityType}
                    </span>
                    <span className="text-sm text-gray-500">
                      Confidence:{" "}
                      {Math.round(snippet.metadata.confidence * 100)}%
                    </span>
                  </div>
                  {snippet.metadata.query && (
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-700">
                        View Query
                      </summary>
                      <p className="mt-1 p-2 bg-gray-50 rounded text-xs">
                        {snippet.metadata.query}
                      </p>
                    </details>
                  )}
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {snippet.text}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              onClick={() => rejectSnippets(group.key, "User rejected")}
              variant="secondary"
              disabled={processing === group.key}
            >
              {processing === group.key ? "Rejecting..." : "Reject All"}
            </Button>
            <Button
              onClick={() => approveSnippets(group.key)}
              disabled={processing === group.key}
            >
              {processing === group.key ? "Approving..." : "Approve All"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};
