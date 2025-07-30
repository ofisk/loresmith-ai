import type React from "react";
import { useState } from "react";
import { useFormSubmissionWithData } from "../../hooks/useFormSubmission";
import type {
  CreateCampaignRequest,
  CreateCampaignResponse,
} from "../../types/campaign";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { FormModal } from "../ui/FormModal";

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

  const submitCampaign = async (
    data: CreateCampaignRequest
  ): Promise<CreateCampaignResponse> => {
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to create campaign");
    }

    return (await response.json()) as CreateCampaignResponse;
  };

  const { handleSubmit, isSubmitting, error, reset } =
    useFormSubmissionWithData(submitCampaign, {
      onSuccess: (data) => {
        onCampaignCreated(data.campaign.campaignId);
        resetForm();
        onClose();
      },
      successMessage: "Campaign created successfully!",
      errorMessage: "Failed to create campaign",
      validate: (data) => {
        if (!data.name.trim()) {
          return "Campaign name is required";
        }
        return null;
      },
    });

  const handleInputChange = (
    field: keyof CreateCampaignRequest,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(formData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
    });
    reset();
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Campaign"
      isSubmitting={isSubmitting}
      error={error}
      onSubmit={handleFormSubmit}
      submitText="Create Campaign"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="campaign-name" title="Campaign Name">
            Campaign Name
          </Label>
          <Input
            id="campaign-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Enter campaign name"
            disabled={isSubmitting}
            required
          />
        </div>
      </div>
    </FormModal>
  );
}
