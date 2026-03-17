/**
 * Centralized constants file for the Loresmith AI application
 * This file contains all shared constants used throughout the application
 */

// Re-export from shared-config.ts for convenience
export {
	API_CONFIG,
	APPROVAL,
	AUTH_CODES,
	type AuthResponse,
	type ToolResult,
} from "./shared-config";

// Application-specific constants
export const APP_CONFIG = {
	NAME: "Loresmith AI",
	VERSION: "1.0.0",
	DESCRIPTION: "AI-powered campaign management and planning tool",
} as const;

// Processing limits - single source of truth for memory/file constraints
export const PROCESSING_LIMITS = {
	/** Cloudflare Workers memory limit (MB). Used for file size checks and error messages. */
	MEMORY_LIMIT_MB: 128,
	/**
	 * Max size (bytes) per PDF part for indexing. PDF.js allocates a ChunkedStream of this size in the Worker.
	 * Upload limit is 500MB (UPLOAD_CONFIG.MAX_FILE_SIZE). PDFs over this constant are split automatically
	 * in the browser before upload so each part is under 100MB and can be indexed.
	 */
	MAX_PDF_SIZE_FOR_RANGE_BYTES: 100 * 1024 * 1024,
} as const;

const _cannotProcessText = `Files over ${PROCESSING_LIMITS.MEMORY_LIMIT_MB}MB cannot be processed in one pass due to memory limits. Large files are processed in chunks; if you see this, processing failed.`;

/** User-facing copy for memory limit and upload errors. Upload max = UPLOAD_CONFIG.MAX_FILE_SIZE; processing uses chunks. */
export const MEMORY_LIMIT_COPY = {
	/** Generic: processing failed (e.g. after upload) */
	generic: `This file could not be processed. Large files are normally processed in chunks; if the problem persists, try a smaller file.`,
	/** Short fallback for status/indicators */
	short: `File could not be processed. Large files are processed in chunks; try again or use a smaller file.`,
	/** Fallback when error has no message */
	fallback: `This file could not be processed. Large files are processed in chunks. If the problem persists, try a smaller file.`,
	/** "Files over XMB cannot be processed..." (used in RAG, retry alerts) */
	cannotProcess: _cannotProcessText,
	/** Error-parsing suggestion (includes chunking note) */
	suggestion: `Large files are processed in chunks, which may take longer. If processing failed, try a smaller file or try again later.`,
	/** With specific filename (processing failed) */
	withFilename: (fileName: string) =>
		`The file "${fileName}" could not be processed. Large files are processed in chunks; try again or use a smaller file.`,
	/** With filename and size (sync/upload notifications when processing fails) */
	withFileDetails: (fileName: string, sizeMB: number) =>
		`⚠️ "${fileName}" (${sizeMB.toFixed(2)}MB) could not be processed. Large files are processed in chunks; try again or use a smaller file.`,
	/** File too large for processing (RAG endpoint) */
	fileTooLarge: (fileName: string) =>
		`"${fileName}" is too large to process. ${_cannotProcessText}`,
	/** Retry alert (ResourceList) */
	retryAlert: (fileName: string, errorMessage: string) =>
		`⚠️ Cannot retry "${fileName}": ${errorMessage}\n\n${_cannotProcessText}`,
	/** When PDF range loading fails (large PDF fallback) */
	pdfRangeLoadFailed: (fileName: string) =>
		`"${fileName}" could not be processed. Very large or complex PDFs may need to be split into smaller files.`,
} as const;

// File upload constants
export const UPLOAD_CONFIG = {
	/** Max file size for upload (500MB). Large files are processed in chunks. */
	MAX_FILE_SIZE: 500 * 1024 * 1024,
	// MIME types supported by RAG (FileExtractionService). Keep in sync with ResourceUpload and file-upload-security ALLOWED_EXTENSIONS.
	ALLOWED_FILE_TYPES: [
		"application/pdf",
		"text/plain",
		"text/markdown",
		"text/x-markdown",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/json",
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/webp",
	],
	MAX_FILES_PER_USER: 100,
} as const;

// Context recap: user message content for automatic recap (hidden in UI; routing uses it to send to recap agent)
export const CONTEXT_RECAP_PLACEHOLDER = "[Context recap requested]" as const;

// Library path constants - centralized for consistency across upload and search
export const LIBRARY_CONFIG = {
	// Always use "library" as the base path for file storage
	getBasePath: () => "library",
	// Generate library path for a specific user (without bucket name)
	getUserLibraryPath: (username: string) => `library/${username}`,
	// Generate full file path for a specific file in user's library (without bucket name)
	getFilePath: (username: string, filename: string) =>
		`library/${username}/${filename}`,
} as const;

// Campaign constants
export const CAMPAIGN_CONFIG = {
	MAX_CAMPAIGNS_PER_USER: 50,
	MAX_RESOURCES_PER_CAMPAIGN: 100,
	ALLOWED_RESOURCE_TYPES: ["pdf", "character", "note", "image"] as const,
} as const;

// Authentication constants
export const AUTH_CONFIG = {
	JWT_EXPIRY_HOURS: 24,
	SESSION_TIMEOUT_MINUTES: 60,
	MAX_LOGIN_ATTEMPTS: 5,
} as const;

// UI constants
export const UI_CONFIG = {
	DEBOUNCE_DELAY_MS: 300,

	LOADING_TIMEOUT_MS: 30000,
} as const;

// Error messages
export const ERROR_MESSAGES = {
	NETWORK_ERROR: "Network error occurred. Please check your connection.",
	AUTHENTICATION_FAILED:
		"Authentication failed. Please check your credentials.",
	AUTHENTICATION_REQUIRED: "Authentication required. Please log in.",
	ACCESS_DENIED:
		"Access denied. You don't have permission to perform this action.",
	FILE_TOO_LARGE: `File is too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB.`,
	INVALID_FILE_TYPE: "Invalid file type.",
	CAMPAIGN_NOT_FOUND: "Campaign not found",
	RESOURCE_NOT_FOUND: "Resource not found.",
	UNAUTHORIZED: "You are not authorized to perform this action.",
	SERVER_ERROR: "Server error occurred. Please try again later.",
	INTERNAL_SERVER_ERROR: "Internal server error",
	CAMPAIGN_NAME_REQUIRED: "Campaign name is required",
	CAMPAIGN_ID_REQUIRED: "Campaign ID is required",
	RESOURCE_TYPE_REQUIRED: "Resource type is required",
	RESOURCE_ID_REQUIRED: "Resource ID is required",
	RESOURCE_NAME_REQUIRED: "Resource name is required",
	INVALID_RESOURCE_TYPE: "Invalid resource type",
	RESOURCE_NOT_FOUND_IN_CAMPAIGN: "Resource not found in campaign",
	CAMPAIGN_ID_AND_RESOURCE_ID_REQUIRED:
		"Campaign ID and resource ID are required",
} as const;

// User-facing messages
export const USER_MESSAGES = {
	// Authentication messages
	SESSION_EXPIRED: "Your session has expired. Please re-authenticate.",

	// File upload messages
	FILE_RECEIVED: "File has been received and will be processed.",
	FILES_LIST: "Uploaded files:",
	NO_FILES:
		"No files have been uploaded yet. Upload files through the file upload interface.",
	FILE_STATS_TITLE: "File Upload Statistics for user:",
	UPLOAD_URL_GENERATED: "Upload URL generated successfully for",
	METADATA_UPDATED: "Metadata updated successfully for file",
	FILE_INGESTION_STARTED: "File ingestion started successfully for",

	// Campaign messages
	NO_CAMPAIGNS:
		"You don't currently have any campaigns. You can create a new campaign using the createCampaign tool.",
	CAMPAIGNS_FOUND: "Found campaign(s):",
	CAMPAIGN_CREATED: "Campaign created successfully with ID:",
	CAMPAIGN_DELETED: "Campaign deleted successfully.",
	CAMPAIGNS_DELETED: "Campaigns deleted successfully.",
	ALL_CAMPAIGNS_DELETED: "All campaigns deleted successfully.",
	SOME_CAMPAIGNS_NOT_DELETED: "Some campaigns could not be deleted:",
	CAMPAIGN_RESOURCES_FOUND: "Found resource(s) in campaign",
	NO_RESOURCES: "No resources found for this campaign.",
	RESOURCES_FOUND: "Found resource(s):",
	RESOURCE_ADDED: "Resource added successfully to campaign",
	CAMPAIGN_DETAILS: "Campaign details:",
	INDEXING_TRIGGERED: "Indexing triggered successfully",

	// Error messages for users
	FAILED_TO_RETRIEVE_FILES: "Failed to retrieve files",
	FAILED_TO_RETRIEVE_STATS: "Failed to retrieve file stats",
	FAILED_TO_GENERATE_URL: "Failed to generate upload URL",
	FAILED_TO_UPDATE_METADATA: "Failed to update metadata",
	FAILED_TO_TRIGGER_INGESTION: "Failed to trigger ingestion",
	FAILED_TO_FETCH_CAMPAIGNS: "Failed to fetch campaigns",
	FAILED_TO_CREATE_CAMPAIGN: "Failed to create campaign",
	FAILED_TO_FETCH_RESOURCES: "Failed to fetch campaign resources",
	FAILED_TO_ADD_RESOURCE: "Failed to add resource to campaign",
	FAILED_TO_FETCH_DETAILS: "Failed to fetch campaign details",
	FAILED_TO_DELETE_CAMPAIGN: "Failed to delete campaign",
	FAILED_TO_DELETE_CAMPAIGNS: "Failed to delete campaigns",

	// Hook error messages
	HOOK_FAILED_TO_FETCH_CAMPAIGNS: "Failed to fetch campaigns",
	HOOK_FAILED_TO_FETCH_CAMPAIGN: "Failed to fetch campaign",
	HOOK_FAILED_TO_CREATE_CAMPAIGN: "Failed to create campaign",
	HOOK_FAILED_TO_ADD_RESOURCE: "Failed to add resource",
	HOOK_FAILED_TO_REMOVE_RESOURCE: "Failed to remove resource",
	HOOK_FAILED_TO_FETCH_FILES: "Failed to fetch files",
	HOOK_FAILED_TO_FETCH_SESSION_DIGESTS: "Failed to fetch session digests",
	HOOK_FAILED_TO_FETCH_SESSION_DIGEST: "Failed to fetch session digest",
	HOOK_FAILED_TO_CREATE_SESSION_DIGEST: "Failed to create session digest",
	HOOK_FAILED_TO_UPDATE_SESSION_DIGEST: "Failed to update session digest",
	HOOK_FAILED_TO_DELETE_SESSION_DIGEST: "Failed to delete session digest",
	HOOK_FAILED_TO_FETCH_PLANNING_TASKS: "Failed to fetch planning tasks",
	HOOK_FAILED_TO_CREATE_PLANNING_TASK: "Failed to create planning task",
	HOOK_FAILED_TO_UPDATE_PLANNING_TASK: "Failed to update planning task",
	HOOK_FAILED_TO_DELETE_PLANNING_TASK: "Failed to delete planning task",
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
	FILE_UPLOADED: "File uploaded successfully.",
	CAMPAIGN_CREATED: "Campaign created successfully.",
	RESOURCE_ADDED: "Resource added to campaign successfully.",
	METADATA_UPDATED: "Metadata updated successfully.",
	AUTHENTICATION_SUCCESS: "Authentication successful.",
} as const;

// Validation patterns
export const VALIDATION_PATTERNS = {
	USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
	CAMPAIGN_NAME: /^[a-zA-Z0-9\s_-]{1,100}$/,
	FILE_NAME: /^[a-zA-Z0-9\s._-]{1,255}$/,
} as const;

// Reasoning models (gpt-5-mini, gpt-5.2, etc.) do not support the temperature parameter
const REASONING_MODELS = new Set([
	"gpt-5-mini",
	"gpt-5.2",
	"o4-mini",
	"o1",
	"o1-mini",
]);

// Model configuration - Change models here!
export const MODEL_CONFIG = {
	// OpenAI Models
	OPENAI: {
		// Primary model for chat and general tasks
		PRIMARY: "gpt-5-mini",
		// Model for user-facing interactive chat/tool orchestration
		INTERACTIVE: "gpt-5-mini",
		// Model for metadata generation and analysis
		ANALYSIS: "gpt-5-mini",
		// Model for non-interactive structured/background pipeline steps
		PIPELINE_STRUCTURED: "gpt-5-mini",
		// Lighter model for low-complexity structured extraction (entity extraction, summaries, metadata)
		PIPELINE_LIGHT: "gpt-4o-mini",
		// Model for non-interactive analysis/evaluation pipeline steps
		PIPELINE_ANALYSIS: "gpt-5-mini",
		// Model for metadata analysis (checklist coverage, campaign readiness)
		METADATA_ANALYSIS: "gpt-5-mini",
		// Model for session planning and script generation
		SESSION_PLANNING: "gpt-5.2",
		// Model for embeddings (if using OpenAI embeddings)
		EMBEDDINGS: "text-embedding-3-small",
	},
	// Anthropic Models
	ANTHROPIC: {
		PRIMARY: "claude-sonnet-4-6",
		INTERACTIVE: "claude-sonnet-4-6",
		ANALYSIS: "claude-sonnet-4-6",
		PIPELINE_STRUCTURED: "claude-sonnet-4-6",
		PIPELINE_LIGHT: "claude-haiku-4-5",
		PIPELINE_ANALYSIS: "claude-sonnet-4-6",
		METADATA_ANALYSIS: "claude-sonnet-4-6",
		SESSION_PLANNING: "claude-sonnet-4-6",
	},
	// Model parameters
	PARAMETERS: {
		// Default temperature for chat responses
		CHAT_TEMPERATURE: 0.7,
		// Default temperature for analysis tasks
		ANALYSIS_TEMPERATURE: 0.3,
		// Default temperature for metadata analysis
		METADATA_ANALYSIS_TEMPERATURE: 0.1,
		// Default temperature for session planning
		SESSION_PLANNING_TEMPERATURE: 0.7,
		// Maximum tokens for responses
		MAX_TOKENS: 4000,
		// Maximum tokens for metadata analysis
		METADATA_ANALYSIS_MAX_TOKENS: 2000,
		// Maximum tokens for session planning (longer scripts need more tokens)
		SESSION_PLANNING_MAX_TOKENS: 8000,
		// Top P for response generation
		TOP_P: 0.9,
	},
	// LLM Provider configuration
	PROVIDER: {
		// Default provider for LLM operations
		DEFAULT: "anthropic" as const,
	},
	// Check if model is a reasoning model (temperature not supported)
	isReasoningModel: (modelId: string): boolean =>
		REASONING_MODELS.has(modelId.toLowerCase()),
} as const;

export type GenerationProviderType = keyof Pick<
	typeof MODEL_CONFIG,
	"OPENAI" | "ANTHROPIC"
>;

export type TextGenerationTier =
	| "PRIMARY"
	| "INTERACTIVE"
	| "ANALYSIS"
	| "PIPELINE_STRUCTURED"
	| "PIPELINE_LIGHT"
	| "PIPELINE_ANALYSIS"
	| "METADATA_ANALYSIS"
	| "SESSION_PLANNING";

export function getGenerationModelForProvider(
	tier: TextGenerationTier,
	provider: "openai" | "anthropic" = MODEL_CONFIG.PROVIDER.DEFAULT
): string {
	return provider === "anthropic"
		? MODEL_CONFIG.ANTHROPIC[tier]
		: MODEL_CONFIG.OPENAI[tier];
}

// Rate limits for non-admin users (admin users bypass all limits)
// Fallback values when tier limits unavailable (e.g. UsageLimitsModal)
export const RATE_LIMITS = {
	NON_ADMIN_TPH: 600_000, // 10k/min * 60 = tokens per hour
	NON_ADMIN_QPH: 600, // 10/min * 60 = queries per hour (Basic tier fallback)
	NON_ADMIN_TPD: 500_000,
	NON_ADMIN_QPD: 500,
	RESOURCES_PER_CAMPAIGN_PER_HOUR: 20, // Basic tier fallback
} as const;

export type SubscriptionTier = "free" | "basic" | "pro";

export interface TierLimits {
	maxCampaigns: number;
	maxFiles: number;
	storageBytes: number;
	tph: number; // tokens per hour (was tpm * 60)
	qph: number; // queries per hour (was qpm * 60)
	tpd: number;
	qpd: number;
	/** Monthly token cap; undefined for paid tiers and when using lifetimeTokens */
	monthlyTokens?: number;
	/** One-time trial token cap for free tier; undefined for paid tiers. When set, replaces monthlyTokens. */
	lifetimeTokens?: number;
	/** Per-file retries per day for indexation/entity extraction retry */
	retriesPerFilePerDay: number;
	/** Per-file retries per month for indexation/entity extraction retry */
	retriesPerFilePerMonth: number;
	/** Resources addable per campaign per rolling hour (Basic/Pro differ) */
	resourcesPerCampaignPerHour: number;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, TierLimits> = {
	free: {
		maxCampaigns: 1,
		maxFiles: 5,
		storageBytes: 25 * 1024 * 1024, // 25MB
		tph: 120_000,
		qph: 300,
		tpd: 10_000,
		qpd: 50,
		lifetimeTokens: 150_000, // One-time trial capacity; no monthly reset
		retriesPerFilePerDay: 2,
		retriesPerFilePerMonth: 6,
		resourcesPerCampaignPerHour: 5,
	},
	basic: {
		maxCampaigns: 5,
		maxFiles: 25,
		storageBytes: 1 * 1024 * 1024 * 1024, // 1GB
		tph: 600_000, // was 10k/min * 60
		qph: 600, // 10/min * 60 = queries per hour
		tpd: 500_000,
		qpd: 500,
		retriesPerFilePerDay: 3,
		retriesPerFilePerMonth: 15,
		resourcesPerCampaignPerHour: 20,
	},
	pro: {
		maxCampaigns: 999_999, // effectively unlimited
		maxFiles: 100,
		storageBytes: 5 * 1024 * 1024 * 1024, // 5GB
		tph: 1_200_000, // was 20k/min * 60
		qph: 1_200, // 20/min * 60 = queries per hour
		tpd: 1_000_000,
		qpd: 1_000,
		retriesPerFilePerDay: 5,
		retriesPerFilePerMonth: 50,
		resourcesPerCampaignPerHour: 50,
	},
} as const;

// Default values
export const DEFAULTS = {
	CAMPAIGN_NAME: "Untitled Campaign",
	FILE_DESCRIPTION: "No description provided",
	TAGS: [] as string[],
} as const;

// JWT Storage
export const JWT_STORAGE_KEY = "loresmith-jwt";
