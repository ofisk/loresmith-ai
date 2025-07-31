import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration } from "../../services/auth-service";
import type {
  Campaign,
  CampaignDetailProps,
  CreateCampaignResponse,
} from "../../types/campaign";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { CharacterSheetList, CharacterSheetUpload } from "../character-sheet";
import { Loader } from "../loader/Loader";

export function CampaignDetail({
  campaignId,
  onBack,
  onAddResource,
}: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingResource, setRemovingResource] = useState<string | null>(null);
  const [showCharacterSheetUpload, setShowCharacterSheetUpload] =
    useState(false);

  const fetchCampaign = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        `/api/campaigns/${campaignId}`
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error("Failed to fetch campaign");
      }

      const data = (await response.json()) as CreateCampaignResponse;
      setCampaign(data.campaign);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGN
      );
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleRemoveResource = async (resourceId: string) => {
    if (!campaign) return;

    try {
      setRemovingResource(resourceId);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        `/api/campaigns/${campaignId}/resources/${resourceId}`,
        {
          method: "DELETE",
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error("Failed to remove resource");
      }

      // Refresh campaign data
      await fetchCampaign();
      toast.success("Resource removed successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove resource"
      );
    } finally {
      setRemovingResource(null);
    }
  };

  const handleCharacterSheetAdded = (_characterSheet: any) => {
    toast.success("Character sheet added successfully!");
    // Refresh campaign data if needed
    fetchCampaign();
  };

  const handleCharacterSheetRemoved = (_characterSheetId: string) => {
    toast.success("Character sheet removed successfully!");
    // Refresh campaign data if needed
    fetchCampaign();
  };

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">Campaign not found</p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-gray-600">
            Created: {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCharacterSheetUpload(true)}>
            Upload Character Sheet
          </Button>
          <Button onClick={onAddResource}>Add Resource</Button>
          <Button onClick={onBack} variant="secondary">
            Back to Campaigns
          </Button>
        </div>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-4">Resources</h2>
        {campaign.resources && campaign.resources.length > 0 ? (
          <div className="space-y-3">
            {campaign.resources.map((resource) => (
              <div
                key={resource.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{resource.name}</h3>
                  <p className="text-sm text-gray-600">{resource.type}</p>
                </div>
                <Button
                  onClick={() => handleRemoveResource(resource.id)}
                  disabled={removingResource === resource.id}
                  variant="destructive"
                  size="sm"
                >
                  {removingResource === resource.id ? "Removing..." : "Remove"}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">
            No resources added yet. Click "Add Resource" to get started.
          </p>
        )}
      </Card>

      <Card>
        <CharacterSheetList
          campaignId={campaignId}
          onCharacterSheetRemoved={handleCharacterSheetRemoved}
        />
      </Card>

      <CharacterSheetUpload
        isOpen={showCharacterSheetUpload}
        onClose={() => setShowCharacterSheetUpload(false)}
        campaignId={campaignId}
        onCharacterSheetAdded={handleCharacterSheetAdded}
      />
    </div>
  );
}
