/**
 * Utility functions for constructing consistent file keys and paths
 */
import { LIBRARY_CONFIG } from "../app-constants";

/**
 * Constructs an AutoRAG file key for a given tenant and filename
 * @param tenant - The tenant/username
 * @param filename - The filename
 * @param prefix - The prefix to use (defaults to "library")
 * @returns The AutoRAG file key in format: {prefix}/{tenant}/{filename}
 */
export function buildAutoRAGFileKey(
  tenant: string,
  filename: string,
  prefix: string = "library"
): string {
  return `${prefix}/${tenant}/${filename}`;
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
 * Constructs a library file key for permanent storage using hash-based paths
 * @param tenant - The tenant/username
 * @param filename - The filename
 * @param autoragPrefix - The AUTORAG_PREFIX to extract library path from
 * @returns The library file key in format: library/{tenant}/{hash}/{filename}
 */
export async function buildLibraryFileKey(
  tenant: string,
  filename: string,
  autoragPrefix: string
): Promise<string> {
  // Create a hash of the filename to avoid special character issues
  const filenameHash = await crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(filename))
    .then((hashBuffer) =>
      Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 16)
    ); // Use first 16 chars of hash

  // Use hash-based path structure: library/username/hash/filename
  return `${LIBRARY_CONFIG.getBasePath(autoragPrefix)}/${tenant}/${filenameHash}/${filename}`;
}

/**
 * Extracts the tenant from a file key
 * @param fileKey - The file key (e.g., "library/username/file.pdf")
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
 * @param fileKey - The file key (e.g., "library/username/file.pdf")
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
 * @param expectedPrefix - The expected prefix (e.g., "library", "staging")
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
