import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type {
  Campaign,
  CampaignDetailProps,
  CampaignResource,
  CreateCampaignResponse,
} from "../../types/campaign";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
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

  useEffect(() => {
    fetchCampaign();
  }, []);

  const fetchCampaign = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch campaign");
      }

      const data = (await response.json()) as CreateCampaignResponse;
      setCampaign(data.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch campaign");
    } finally {
      setLoading(false);
    }
  };

  const removeResource = async (resourceId: string) => {
    try {
      setRemovingResource(resourceId);

      const response = await fetch(
        `/api/campaigns/${campaignId}/resource/${resourceId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove resource");
      }

      // Refresh campaign data
      await fetchCampaign();
      toast.success("Resource removed successfully");
    } catch (err) {
      console.error("Failed to remove resource:", err);
      toast.error("Failed to remove resource");
    } finally {
      setRemovingResource(null);
    }
  };

  const triggerIndexing = async () => {
    try {
      const response = await fetch(`/campaign/${campaignId}/index`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to trigger indexing");
      }

      const data = (await response.json()) as { resourceCount: number };
      toast.success(
        `Indexing triggered successfully! Processing ${data.resourceCount} resources.`
      );
    } catch (err) {
      console.error("Failed to trigger indexing:", err);
      toast.error("Failed to trigger indexing");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getResourceIcon = (type: CampaignResource["type"]) => {
    switch (type) {
      case "pdf":
        return "📄";
      case "character":
        return "👤";
      case "note":
        return "📝";
      case "image":
        return "🖼️";
      default:
        return "📎";
    }
  };

  const getResourceTypeLabel = (type: CampaignResource["type"]) => {
    switch (type) {
      case "pdf":
        return "PDF";
      case "character":
        return "Character";
      case "note":
        return "Note";
      case "image":
        return "Image";
      default:
        return "Resource";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <div className="space-x-2">
          <Button onClick={onBack} variant="secondary">
            Go Back
          </Button>
          <Button onClick={fetchCampaign} variant="secondary">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center p-6">
        <p className="text-red-600 mb-4">Campaign not found</p>
        <Button onClick={onBack} variant="secondary">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button onClick={onBack} variant="ghost" size="sm">
            ← Back
          </Button>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
        </div>
        <div className="flex space-x-2">
          <Button onClick={triggerIndexing} variant="secondary">
            Index Campaign
          </Button>
          <Button onClick={onAddResource}>Add Resource</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Campaign Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(campaign.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span>{formatDate(campaign.updatedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Total Resources:
                  </span>
                  <span className="font-medium">
                    {campaign.resources.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Resource Breakdown</h3>
              <div className="space-y-1 text-sm">
                {["pdf", "character", "note", "image"].map((type) => {
                  const count = campaign.resources.filter(
                    (r) => r.type === type
                  ).length;
                  if (count === 0) return null;

                  return (
                    <div key={type} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {getResourceIcon(type as CampaignResource["type"])}{" "}
                        {getResourceTypeLabel(type as CampaignResource["type"])}s:
                      </span>
                      <span>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Resources</h2>

        {campaign.resources.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              No resources added to this campaign yet.
            </p>
            <Button onClick={onAddResource}>Add Your First Resource</Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaign.resources.map((resource) => (
              <Card key={resource.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-lg">
                        {getResourceIcon(resource.type)}
                      </span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {getResourceTypeLabel(resource.type)}
                      </span>
                    </div>
                    <h4 className="font-medium truncate">
                      {resource.name ||
                        `Unnamed ${getResourceTypeLabel(resource.type)}`}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: {resource.id.slice(0, 8)}...
                    </p>
                  </div>

                  <Button
                    onClick={() => removeResource(resource.id)}
                    variant="ghost"
                    size="sm"
                    disabled={removingResource === resource.id}
                    className="ml-2 flex-shrink-0"
                  >
                    {removingResource === resource.id ? (
                      <Loader size={16} />
                    ) : (
                      "×"
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
