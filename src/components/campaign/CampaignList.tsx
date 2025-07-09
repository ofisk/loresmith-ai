import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { Label } from "@/components/label/Label";
import { Loader } from "@/components/loader/Loader";
import { type Campaign, useCampaigns } from "@/hooks/useCampaigns";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";

interface CampaignListProps {
  className?: string;
}

export function CampaignList({ className = "" }: CampaignListProps) {
  const { campaigns, loading, error } = useCampaigns();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newCampaignName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to create campaign");
      }

      // Reset form and refresh
      setNewCampaignName("");
      setShowCreateForm(false);
      // Note: In a real app, you'd want to refresh the campaigns list
      // For now, we'll rely on the user refreshing the page
      window.location.reload();
    } catch (error) {
      console.error("Error creating campaign:", error);
      alert("Failed to create campaign. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader className="h-8 w-8" />
        <span className="ml-2">Loading campaigns...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <Card className="p-4 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <p className="text-red-600 dark:text-red-400">
            Error loading campaigns: {error}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Campaigns</h2>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Create Campaign Form */}
      {showCreateForm && (
        <Card className="p-4">
          <form onSubmit={handleCreateCampaign} className="space-y-4">
            <div>
              <Label htmlFor="campaign-name" title="Campaign Name">
                Campaign Name
              </Label>
              <Input
                id="campaign-name"
                value={newCampaignName}
                onValueChange={(value) => setNewCampaignName(value)}
                placeholder="Enter campaign name..."
                disabled={isCreating}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isCreating || !newCampaignName.trim()}
              >
                {isCreating ? "Creating..." : "Create Campaign"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewCampaignName("");
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="space-y-2">
            <p className="text-muted-foreground">No campaigns found</p>
            <p className="text-sm text-muted-foreground">
              Create your first campaign to get started
            </p>
            <Button onClick={() => setShowCreateForm(true)} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.campaignId} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CampaignCardProps {
  campaign: Campaign;
}

function CampaignCard({ campaign }: CampaignCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${campaign.name}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaign.campaignId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete campaign");
      }

      // Refresh the page to update the list
      window.location.reload();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      alert("Failed to delete campaign. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg truncate">{campaign.name}</h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Edit campaign"
            >
              <PencilSimple className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete campaign"
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Created:{" "}
            {new Date(campaign.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p>
            Updated:{" "}
            {new Date(campaign.updatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              // TODO: Navigate to campaign details or open campaign
              console.log("Opening campaign:", campaign.campaignId);
            }}
          >
            Open Campaign
          </Button>
        </div>
      </div>
    </Card>
  );
}
