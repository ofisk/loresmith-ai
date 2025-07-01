import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import type {
  CreateCampaignRequest,
  CreateCampaignResponse,
} from "../../types/campaign";
import { Button } from "../button/Button";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { Loader } from "../loader/Loader";
import { Modal } from "../modal/Modal";

export interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCampaignCreated: (campaignId: string) => void;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  onCampaignCreated,
}: CreateCampaignModalProps) {
  const [formData, setFormData] = useState<CreateCampaignRequest>({
    name: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (
    field: keyof CreateCampaignRequest,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError("Campaign name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to create campaign");
      }

      const data = (await response.json()) as CreateCampaignResponse;

      toast.success("Campaign created successfully!");
      onCampaignCreated(data.campaign.campaignId);
      resetForm();
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create campaign";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
    });
    setError(null);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6 max-w-2xl">
        <h2 className="text-xl font-semibold mb-6">Create New Campaign</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            {/* Campaign Name */}
            <div>
              <Label htmlFor="name" title="Campaign Name">
                Campaign Name *
              </Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onValueChange={(value) => handleInputChange("name", value)}
                placeholder="Enter campaign name..."
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="mr-2" />
                  Creating...
                </>
              ) : (
                "Create Campaign"
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
