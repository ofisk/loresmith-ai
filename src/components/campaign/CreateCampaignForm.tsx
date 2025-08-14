import { useState, useId } from "react";
import { USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration } from "../../services/auth-service";
import { API_CONFIG } from "../../shared";
import type { Campaign, CreateCampaignFormProps } from "../../types/campaign";

export function CreateCampaignForm({
  onSuccess,
  onCancel,
  defaultName = "",
}: CreateCampaignFormProps) {
  const campaignNameId = useId();
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Campaign name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim() }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to create campaign: ${response.status}`);
      }

      const data = (await response.json()) as { campaign: Campaign };
      onSuccess(data.campaign);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_CREATE_CAMPAIGN
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor={campaignNameId}
          className="block text-sm font-medium mb-2"
        >
          Campaign Name
        </label>
        <input
          id={campaignNameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter campaign name"
          disabled={loading}
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Campaign"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
