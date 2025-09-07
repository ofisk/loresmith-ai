/**
 * Utility functions for constructing consistent file keys and paths
 */

/**
 * Constructs an AutoRAG file key for a given tenant and filename
 * @param tenant - The tenant/username
 * @param filename - The filename
 * @returns The AutoRAG file key in format: autorag/{tenant}/{filename}
 */
export function buildAutoRAGFileKey(tenant: string, filename: string): string {
  return `autorag/${tenant}/${filename}`;
}

/**
 * Constructs a staging file key for temporary uploads
 * @param tenant - The tenant/username
 * @param filename - The filename
 * @returns The staging file key in format: staging/{tenant}/{filename}
 */
export function buildStagingFileKey(tenant: string, filename: string): string {
  return `staging/${tenant}/${filename}`;
}

/**
 * Extracts the tenant from a file key
 * @param fileKey - The file key (e.g., "autorag/username/file.pdf")
 * @returns The tenant/username or null if invalid format
 */
export function extractTenantFromFileKey(fileKey: string): string | null {
  const parts = fileKey.split("/");
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}

/**
 * Extracts the filename from a file key
 * @param fileKey - The file key (e.g., "autorag/username/file.pdf")
 * @returns The filename or null if invalid format
 */
export function extractFilenameFromFileKey(fileKey: string): string | null {
  const parts = fileKey.split("/");
  if (parts.length >= 3) {
    return parts[2];
  }
  return null;
}

/**
 * Validates if a file key has the correct format
 * @param fileKey - The file key to validate
 * @param expectedPrefix - The expected prefix (e.g., "autorag", "staging")
 * @returns True if the file key has the correct format
 */
export function isValidFileKey(
  fileKey: string,
  expectedPrefix?: string
): boolean {
  const parts = fileKey.split("/");

  if (parts.length < 3) {
    return false;
  }

  if (expectedPrefix && parts[0] !== expectedPrefix) {
    return false;
  }

  // Check that tenant and filename are not empty
  return parts[1].length > 0 && parts[2].length > 0;
}
