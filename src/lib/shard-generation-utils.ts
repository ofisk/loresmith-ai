// Utilities for entity/staging generation with robust path handling and validation

/**
 * Standardized resource interface for entity staging
 * This ensures consistent field names across the system
 */
export interface ShardGenerationResource {
  id: string; // Resource UUID
  file_key: string; // Full file path (e.g., "staging/ofisk/file.pdf")
  file_name: string; // Just filename (e.g., "file.pdf")
  campaign_id: string; // Campaign UUID
}

/**
 * Options interface for entity staging (replaces old ShardGenerationOptions)
 */
export interface EntityStagingOptionsLike {
  env?: any;
  username?: string;
  campaignId?: string;
  campaignName?: string;
  resource?: any;
  campaignRagBasePath?: string;
}

/**
 * Validates that a resource has the required fields for shard generation
 */
export function validateShardGenerationResource(
  resource: any
): ShardGenerationResource {
  if (!resource) {
    throw new Error("Resource is required for shard generation");
  }

  if (!resource.id) {
    throw new Error("Resource ID is required");
  }

  if (!resource.file_key) {
    throw new Error("Resource file_key is required for AutoRAG search");
  }

  if (!resource.file_name) {
    throw new Error("Resource file_name is required");
  }

  return {
    id: resource.id,
    file_key: resource.file_key,
    file_name: resource.file_name,
    campaign_id: resource.campaign_id || resource.campaignId,
  };
}

/**
 * Determines the correct search path for AutoRAG based on the resource
 * This is the single source of truth for how we construct search paths
 */
export function getAutoRAGSearchPath(
  resource: ShardGenerationResource
): string {
  // Extract folder path from file_key
  // e.g., "library/username/file.pdf/file.pdf" -> "library/username/file.pdf/"
  const fileKey = resource.file_key;
  const lastSlashIndex = fileKey.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return fileKey;
  }
  // Return the folder path (everything up to but not including the last filename)
  return fileKey.substring(0, lastSlashIndex + 1);
}

/**
 * Validates that the search path looks reasonable
 * This helps catch configuration issues early
 */
export function validateSearchPath(searchPath: string): void {
  if (!searchPath || searchPath.trim().length === 0) {
    throw new Error("Search path cannot be empty");
  }

  if (searchPath.length < 3) {
    throw new Error(`Search path too short: "${searchPath}"`);
  }

  // Check for common issues
  if (searchPath.includes("undefined") || searchPath.includes("null")) {
    throw new Error(`Search path contains undefined/null: "${searchPath}"`);
  }

  // Warn about potential issues
  if (searchPath.match(/^[a-f0-9-]{36}$/)) {
    console.warn(
      `[ShardGeneration] Search path looks like a UUID: "${searchPath}". This might indicate a field mapping issue.`
    );
  }

  if (!searchPath.includes("/")) {
    console.warn(
      `[ShardGeneration] Search path has no path separators: "${searchPath}". This might not match indexed content.`
    );
  }
}

/**
 * Creates a standardized resource object from various input formats
 * This handles the different ways resources can be passed to shard generation
 */
export function normalizeResourceForShardGeneration(
  resource: any
): ShardGenerationResource {
  // Handle different possible field names
  const normalized = {
    id: resource.id || resource.resourceId,
    file_key: resource.file_key || resource.fileKey || resource.id, // fallback to id if file_key missing
    file_name: resource.file_name || resource.fileName || resource.name,
    campaign_id: resource.campaign_id || resource.campaignId,
  };

  return validateShardGenerationResource(normalized);
}

/**
 * Logs detailed information about the shard generation process for debugging
 */
export function logShardGenerationContext(
  resource: ShardGenerationResource,
  searchPath: string,
  campaignId: string
): void {
  console.log(`[ShardGeneration] Context:`, {
    resourceId: resource.id,
    fileKey: resource.file_key,
    fileName: resource.file_name,
    searchPath,
    campaignId,
    pathMatches: resource.file_key === searchPath,
  });
}

/**
 * Validates the complete entity staging options
 */
export function validateShardGenerationOptions(
  options: EntityStagingOptionsLike
): void {
  if (!options.env) {
    throw new Error("Environment is required for entity staging");
  }

  if (!options.username) {
    throw new Error("Username is required for entity staging");
  }

  if (!options.campaignId) {
    throw new Error("Campaign ID is required for entity staging");
  }

  if (!options.campaignName) {
    throw new Error("Campaign name is required for entity staging");
  }

  if (!options.resource) {
    throw new Error("Resource is required for entity staging");
  }

  if (!options.campaignRagBasePath) {
    throw new Error("Campaign RAG base path is required for entity staging");
  }
}
