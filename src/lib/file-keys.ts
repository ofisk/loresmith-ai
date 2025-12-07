/**
 * Utility functions for constructing consistent file keys and paths
 */
import { LIBRARY_CONFIG } from "../app-constants";

/**
 * Helper function to append a number to a filename before the extension
 * @param filename - Original filename
 * @param number - Number to append
 * @returns Filename with number appended (e.g., "file.pdf" -> "file (1).pdf")
 */
export function appendNumberToFilename(
  filename: string,
  number: number
): string {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) {
    // No extension
    return `${filename} (${number})`;
  }
  const name = filename.substring(0, lastDotIndex);
  const extension = filename.substring(lastDotIndex);
  return `${name} (${number})${extension}`;
}

/**
 * Helper function to append a number to a display name
 * @param displayName - Original display name
 * @param number - Number to append
 * @returns Display name with number appended (e.g., "My File" -> "My File (1)")
 */
export function appendNumberToDisplayName(
  displayName: string,
  number: number
): string {
  return `${displayName} (${number})`;
}

/**
 * Get a unique filename by appending an incrementing number if a collision exists
 * @param checkExists - Async function that checks if a filename exists for a user
 * @param originalFilename - The original filename
 * @param username - The username
 * @returns A unique filename
 */
export async function getUniqueFilename(
  checkExists: (username: string, filename: string) => Promise<boolean>,
  originalFilename: string,
  username: string
): Promise<string> {
  // Check if the original filename is already taken
  const exists = await checkExists(username, originalFilename);
  if (!exists) {
    return originalFilename;
  }

  // Try appending numbers until we find a unique name
  let counter = 1;
  let candidateFilename = appendNumberToFilename(originalFilename, counter);

  while (await checkExists(username, candidateFilename)) {
    counter++;
    candidateFilename = appendNumberToFilename(originalFilename, counter);

    // Safety limit to prevent infinite loops
    if (counter > 1000) {
      // Fallback to timestamp-based name
      const timestamp = Date.now();
      const lastDotIndex = originalFilename.lastIndexOf(".");
      if (lastDotIndex === -1) {
        return `${originalFilename}_${timestamp}`;
      }
      const name = originalFilename.substring(0, lastDotIndex);
      const extension = originalFilename.substring(lastDotIndex);
      return `${name}_${timestamp}${extension}`;
    }
  }

  return candidateFilename;
}

/**
 * Get a unique display name by appending an incrementing number if a collision exists
 * @param checkExists - Async function that checks if a display name exists for a user
 * @param originalDisplayName - The original display name
 * @param username - The username
 * @param excludeFileKey - Optional file key to exclude from collision check (for updates)
 * @returns A unique display name
 */
export async function getUniqueDisplayName(
  checkExists: (
    username: string,
    displayName: string,
    excludeFileKey?: string
  ) => Promise<boolean>,
  originalDisplayName: string,
  username: string,
  excludeFileKey?: string
): Promise<string> {
  if (!originalDisplayName) {
    return originalDisplayName; // Empty display names don't need uniqueness
  }

  // Check if the original display name is already taken
  const exists = await checkExists(
    username,
    originalDisplayName,
    excludeFileKey
  );
  if (!exists) {
    return originalDisplayName;
  }

  // Try appending numbers until we find a unique name
  let counter = 1;
  let candidateDisplayName = appendNumberToDisplayName(
    originalDisplayName,
    counter
  );

  while (await checkExists(username, candidateDisplayName, excludeFileKey)) {
    counter++;
    candidateDisplayName = appendNumberToDisplayName(
      originalDisplayName,
      counter
    );

    // Safety limit to prevent infinite loops
    if (counter > 1000) {
      // Fallback to timestamp-based name
      const timestamp = Date.now();
      return `${originalDisplayName}_${timestamp}`;
    }
  }

  return candidateDisplayName;
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
 * @returns The library file key in format: library/{tenant}/{hash}/{filename}
 */
export async function buildLibraryFileKey(
  tenant: string,
  filename: string
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
  return `${LIBRARY_CONFIG.getBasePath()}/${tenant}/${filenameHash}/${filename}`;
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
