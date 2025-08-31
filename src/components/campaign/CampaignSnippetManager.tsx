import type React from "react";
import { useEffect } from "react";
import { useCampaignSnippetManagement } from "../../hooks/useCampaignSnippetManagement";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Loader } from "../loader/Loader";

interface CampaignSnippetManagerProps {
  campaignId: string;
  onSnippetsUpdated?: () => void;
}

export const CampaignSnippetManager: React.FC<CampaignSnippetManagerProps> = ({
  campaignId,
  onSnippetsUpdated,
}) => {
  const {
    stagedSnippets,
    loading,
    error,
    processing,
    refreshing,
    fetchStagedSnippets,
    approveSnippets,
    rejectSnippets,
    refreshSnippets,
  } = useCampaignSnippetManagement(campaignId);

  // Load snippets on component mount
  useEffect(() => {
    fetchStagedSnippets();
  }, [fetchStagedSnippets]);

  // Listen for resource added events to refresh snippets
  useEffect(() => {
    const handleResourceAdded = () => {
      // Small delay to allow the backend to process
      setTimeout(() => {
        fetchStagedSnippets();
      }, 1000);
    };

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
  }, [fetchStagedSnippets]);

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
          <Button onClick={refreshSnippets} variant="secondary" size="sm">
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
                      <p className="mt-1 p-2 bg-gray-50 rounded">
                        {snippet.metadata.query}
                      </p>
                    </details>
                  )}
                </div>
                <p className="text-gray-700">{snippet.text}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              onClick={() => rejectSnippets(group.key, "Rejected by user")}
              variant="secondary"
              size="sm"
              disabled={processing === group.key}
            >
              {processing === group.key ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              onClick={() => {
                approveSnippets(group.key);
                onSnippetsUpdated?.();
              }}
              variant="primary"
              size="sm"
              disabled={processing === group.key}
            >
              {processing === group.key ? "Approving..." : "Approve"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};
