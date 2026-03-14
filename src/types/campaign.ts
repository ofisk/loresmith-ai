// Campaign and Resource Types - Shared between Durable Objects and UI Components

export type ResourceType = "file" | "character" | "note" | "image";

/** Database row shape for campaigns table (snake_case) */
export interface CampaignRow {
	id: string;
	name: string;
	username: string;
	description?: string;
	campaignRagBasePath?: string;
	metadata?: string | null;
	created_at: string;
	updated_at: string;
}

/** Database row shape for campaign_resources table (snake_case) */
export interface CampaignResourceRow {
	id: string;
	campaign_id: string;
	file_key: string;
	file_name: string;
	display_name?: string;
	description?: string;
	tags?: string;
	status: string;
	created_at: string;
	updated_at?: string;
}

/** Map CampaignRow to camelCase (for consumers that need it) */
export function mapCampaignRow(row: CampaignRow): {
	id: string;
	name: string;
	username: string;
	description?: string;
	campaignRagBasePath?: string;
	metadata?: string | null;
	createdAt: string;
	updatedAt: string;
} {
	return {
		id: row.id,
		name: row.name,
		username: row.username,
		description: row.description,
		campaignRagBasePath: row.campaignRagBasePath,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export interface CampaignResource {
	type: ResourceType;
	id: string;
	name: string;
	campaign_id: string;
	file_key: string;
	file_name: string;
	display_name?: string;
	description?: string;
	tags?: string;
	status: string;
	created_at: string;
	updated_at?: string;
}

/** User's role in the campaign (from membership or ownership) */
export type CampaignRole =
	| "owner"
	| "editor_gm"
	| "readonly_gm"
	| "editor_player"
	| "readonly_player";

// Base campaign interface used by Durable Objects
export interface CampaignData {
	campaignId: string;
	name: string;
	description?: string;
	campaignRagBasePath?: string;
	createdAt: string;
	updatedAt: string;
	resources?: CampaignResource[];
	/** User's role in this campaign (owner or from membership) */
	role?: CampaignRole;
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
