// Campaign and Resource Types - Shared between Durable Objects and UI Components

export type ResourceType = "pdf" | "character" | "note" | "image";

export interface CampaignResource {
  type: ResourceType;
  id: string;
  name: string;
}

// Base campaign interface used by Durable Objects
export interface CampaignData {
  campaignId: string;
  name: string;
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

export interface PdfFile {
  fileKey: string;
  fileName: string;
  fileSize: number;
  uploaded: string;
  status: string;
}

export interface AddResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddResource: (resource: CampaignResource) => void;
  campaignId: string;
  pdf?: PdfFile;
  campaigns?: CampaignData[];
}
