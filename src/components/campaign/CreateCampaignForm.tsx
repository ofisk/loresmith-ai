import { useState } from "react";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface CreateCampaignFormProps {
  className?: string;
  onCampaignCreated?: (campaign: any) => void;
  defaultName?: string;
}

export function CreateCampaignForm({ className, onCampaignCreated, defaultName }: CreateCampaignFormProps) {
  const [campaignName, setCampaignName] = useState(defaultName || "");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!campaignName.trim()) {
      toast.error("Campaign name is required");
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: campaignName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to create campaign");
      }

      const data = (await response.json()) as { campaign: any };
      toast.success("Campaign created successfully!");
      setCampaignName("");
      onCampaignCreated?.(data.campaign);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create campaign";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h3 className="text-ob-base-300 font-medium">Create New Campaign</h3>
        <p className="text-ob-base-200 text-sm">
          Create a new campaign to organize your resources and content
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="campaign-name" title="Campaign Name">
            Campaign Name
          </Label>
          <Input
            id="campaign-name"
            type="text"
            value={campaignName}
            onValueChange={setCampaignName}
            placeholder="Enter campaign name..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleCreate}
            disabled={!campaignName.trim() || isCreating}
            loading={isCreating}
          >
            {isCreating ? "Creating..." : "Create Campaign"}
          </Button>
        </div>
      </div>
    </Card>
  );
} 