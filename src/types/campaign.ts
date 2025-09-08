// Campaign and Resource Types - Shared between Durable Objects and UI Components

export type ResourceType = "file" | "character" | "note" | "image";

export interface CampaignResource {
  type: ResourceType;
  id: string;
  name: string;
  campaign_id: string;
  file_key: string;
  file_name: string;
  description?: string;
  tags?: string;
  status: string;
  created_at: string;
  updated_at?: string;
}

// Base campaign interface used by Durable Objects
export interface CampaignData {
  campaignId: string;
  name: string;
  campaignRagBasePath?: string;
  createdAt: string;
  updatedAt: string;
  resources: CampaignResource[];
}

// Campaign interface for UI components (alias for consistency)
export type Campaign = CampaignData;

// API Request/Response Types
export interface CreateCampaignRequest {
  name: string;
}

export interface CreateCampaignResponse {
  success: boolean;
  campaign: CampaignData;
}

export interface AddResourceRequest {
  type: ResourceType;
  id: string;
  name?: string;
}

export interface AddResourceResponse {
  success: boolean;
  resources: CampaignResource[];
}

export interface RemoveResourceResponse {
  success: boolean;
  resources: CampaignResource[];
}

export interface ListResourcesResponse {
  resources: CampaignResource[];
}

export interface ListCampaignsResponse {
  campaigns: CampaignData[];
}

// Utility types for UI components
export interface CampaignListProps {
  onViewCampaign: (campaignId: string) => void;
  onCreateCampaign: () => void;
}

export interface CampaignDetailProps {
  campaignId: string;
  onBack: () => void;
  onAddResource: () => void;
}

export interface CreateCampaignFormProps {
  onSuccess: (campaign: Campaign) => void;
  onCancel: () => void;
  defaultName?: string;
}

export interface File {
  fileKey: string;
  fileName: string;
  fileSize: number;
  uploaded: string;
  status: string;
}
