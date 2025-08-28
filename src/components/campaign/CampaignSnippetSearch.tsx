import type React from "react";
import { useState } from "react";
import { API_CONFIG } from "../../shared";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Input } from "../input/Input";
import { Loader } from "../loader/Loader";

interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: any;
}

interface CampaignSnippetSearchProps {
  campaignId: string;
}

export const CampaignSnippetSearch: React.FC<CampaignSnippetSearchProps> = ({
  campaignId,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchSnippets = async () => {
    if (!query.trim()) {
      setError("Please enter a search query");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      const response = await fetch(
        `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.CAMPAIGN_AUTORAG.SEARCH_APPROVED(campaignId))}?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("jwt")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to search snippets: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results?: { results?: SearchResult[] };
      };
      setResults(data.results?.results || []);
    } catch (err) {
      console.error("Error searching snippets:", err);
      setError(
        err instanceof Error ? err.message : "Failed to search snippets"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchSnippets();
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setHasSearched(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Search Campaign Snippets</h3>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for monsters, spells, locations, NPCs..."
            className="flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? "Searching..." : "Search"}
          </Button>
          {hasSearched && (
            <Button
              onClick={clearSearch}
              variant="secondary"
              disabled={loading}
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center p-8">
          <Loader />
        </div>
      )}

      {hasSearched && !loading && !error && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium">Search Results ({results.length})</h4>
            {results.length > 0 && (
              <p className="text-sm text-gray-500">
                Showing approved snippets from this campaign
              </p>
            )}
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No approved snippets found matching your search.</p>
              <p className="text-sm mt-2">
                Try different keywords or check if snippets have been approved
                for this campaign.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result) => (
                <Card key={result.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm text-gray-500">
                      Relevance: {Math.round(result.score * 100)}%
                    </span>
                    {result.metadata?.entityType && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {result.metadata.entityType}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {result.text}
                  </p>
                  {result.metadata?.fileName && (
                    <p className="text-xs text-gray-500 mt-2">
                      Source: {result.metadata.fileName}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
