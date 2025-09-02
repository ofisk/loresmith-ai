import type React from "react";
import { useState, useCallback, useEffect } from "react";
import { API_CONFIG } from "../../shared";
import { JWT_STORAGE_KEY } from "../../constants";
import { Loader } from "../loader/Loader";
import {
  SnippetHeader,
  SnippetActionBar,
  SnippetGroup,
  EmptyState,
} from "../chat/snippet";
import type {
  StagedSnippetGroup,
  SnippetSearchResult,
} from "../../types/snippet";

interface UnifiedSnippetDashboardProps {
  campaignId: string;
  onSnippetsUpdated?: () => void;
}

type TabType = "staged" | "approved" | "rejected";

export const UnifiedSnippetDashboard: React.FC<
  UnifiedSnippetDashboardProps
> = ({ campaignId, onSnippetsUpdated }) => {
  const [activeTab, setActiveTab] = useState<TabType>("staged");
  const [stagedSnippets, setStagedSnippets] = useState<StagedSnippetGroup[]>(
    []
  );
  const [searchResults, setSearchResults] = useState<SnippetSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSnippets, setSelectedSnippets] = useState<Set<string>>(
    new Set()
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const tabs = [
    {
      id: "staged" as TabType,
      label: "Staged Snippets",
      description: "Review and approve/reject generated snippets",
    },
    {
      id: "approved" as TabType,
      label: "Approved Snippets",
      description: "Search through approved campaign snippets",
    },
    {
      id: "rejected" as TabType,
      label: "Rejected Snippets",
      description: "View previously rejected snippets",
    },
  ];

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

  // Search approved snippets
  const searchSnippets = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search query");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      const response = await fetch(
        `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.SEARCH_APPROVED(campaignId))}?query=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(JWT_STORAGE_KEY)}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to search snippets: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results?: { results?: SnippetSearchResult[] };
      };
      setSearchResults(data.results?.results || []);
    } catch (err) {
      console.error("Error searching snippets:", err);
      setError(
        err instanceof Error ? err.message : "Failed to search snippets"
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle snippet selection
  const handleSnippetSelection = (snippetId: string, checked: boolean) => {
    const newSelected = new Set(selectedSnippets);
    if (checked) {
      newSelected.add(snippetId);
    } else {
      newSelected.delete(snippetId);
    }
    setSelectedSnippets(newSelected);
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allSnippetIds = stagedSnippets.flatMap((group) =>
        group.snippets.map((snippet) => snippet.id)
      );
      setSelectedSnippets(new Set(allSnippetIds));
    } else {
      setSelectedSnippets(new Set());
    }
  };

  // Approve snippets
  const approveSnippets = async () => {
    if (selectedSnippets.size === 0) return;

    setProcessing("approving");
    try {
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
            stagingKey: Array.from(selectedSnippets).join(","),
            expansions: [],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to approve snippets: ${response.statusText}`);
      }

      // Remove the approved snippets from the list
      setStagedSnippets((prev) =>
        prev.filter((group) =>
          group.snippets.some((snippet) => !selectedSnippets.has(snippet.id))
        )
      );

      setSelectedSnippets(new Set());
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
  const rejectSnippets = async () => {
    if (selectedSnippets.size === 0 || !rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
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
            stagingKey: Array.from(selectedSnippets).join(","),
            reason: rejectionReason,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to reject snippets: ${response.statusText}`);
      }

      // Remove the rejected snippets from the list
      setStagedSnippets((prev) =>
        prev.filter((group) =>
          group.snippets.some((snippet) => !selectedSnippets.has(snippet.id))
        )
      );

      setSelectedSnippets(new Set());
      setRejectionReason("");
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

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
    setHasSearched(false);
  };

  // Load snippets on component mount and tab change
  useEffect(() => {
    if (activeTab === "staged") {
      fetchStagedSnippets();
    }
  }, [activeTab, fetchStagedSnippets]);

  // Listen for resource-added-to-campaign events to refresh snippets
  useEffect(() => {
    const handleResourceAdded = (event: CustomEvent) => {
      const { campaignIds, fileKey, fileName } = event.detail;

      if (campaignIds.includes(campaignId)) {
        console.log(
          `[UnifiedSnippetDashboard] Resource added to campaign ${campaignId}, refreshing snippets...`,
          { fileKey, fileName, campaignIds }
        );

        setTimeout(() => {
          setRefreshing(true);
          fetchStagedSnippets().finally(() => {
            setRefreshing(false);
          });
        }, 2000);
      }
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
  }, [campaignId, fetchStagedSnippets]);

  if (loading && activeTab === "staged") {
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
        <button
          type="button"
          onClick={fetchStagedSnippets}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Campaign Snippets</h2>
        <p className="text-gray-600">
          Manage and search campaign-specific content extracted from your files.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "staged" && (
          <div className="space-y-4">
            {refreshing && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-700 text-sm">
                  🔄 Refreshing snippets... New snippets may appear shortly.
                </p>
              </div>
            )}

            {stagedSnippets.length === 0 ? (
              <EmptyState action="show_staged" />
            ) : (
              <>
                <SnippetHeader
                  action="show_staged"
                  total={stagedSnippets.flatMap((g) => g.snippets).length}
                  campaignId={campaignId}
                  selectedCount={selectedSnippets.size}
                  totalSnippets={
                    stagedSnippets.flatMap((g) => g.snippets).length
                  }
                  onSelectAll={handleSelectAll}
                />

                <SnippetActionBar
                  selectedCount={selectedSnippets.size}
                  processing={processing}
                  action="show_staged"
                  rejectionReason={rejectionReason}
                  onRejectionReasonChange={setRejectionReason}
                  onApprove={approveSnippets}
                  onReject={rejectSnippets}
                />

                <div className="space-y-4">
                  {stagedSnippets.map((group) => (
                    <SnippetGroup
                      key={group.key}
                      group={group}
                      selectedSnippets={selectedSnippets}
                      onSnippetSelection={handleSnippetSelection}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "approved" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Search Campaign Snippets
              </h3>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  searchSnippets();
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for monsters, spells, locations, NPCs..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
                {hasSearched && (
                  <button
                    onClick={clearSearch}
                    type="button"
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>

            {loading && (
              <div className="flex justify-center items-center p-8">
                <Loader />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {!loading && !error && searchResults.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium">
                  Search Results ({searchResults.length})
                </h4>
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {result.metadata?.entityType || "Snippet"}
                      </span>
                      <span className="text-sm text-gray-500">
                        Score: {result.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {result.text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {!loading &&
              !error &&
              hasSearched &&
              searchResults.length === 0 && (
                <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                  <p>No snippets found matching your search query.</p>
                  <p className="text-sm mt-1">
                    Try different keywords or check your spelling.
                  </p>
                </div>
              )}
          </div>
        )}

        {activeTab === "rejected" && (
          <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
            <p>Rejected snippets view coming soon.</p>
            <p className="text-sm mt-1">
              This will show snippets that have been rejected with reasons.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
