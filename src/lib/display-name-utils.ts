/**
 * Utility functions for getting display names from various resource types
 */

/**
 * Gets a display name for a resource file, with fallback priority:
 * 1. display_name (custom name set by user)
 * 2. file_name (original filename)
 * 3. name (generic name field)
 * 4. "Unknown file" (ultimate fallback)
 */
export function getDisplayName(resource: {
  display_name?: string;
  file_name?: string;
  name?: string;
}): string {
  if (resource.display_name) {
    return resource.display_name;
  }
  if (resource.file_name) {
    return resource.file_name;
  }
  if (resource.name) {
    return resource.name;
  }
  return "Unknown file";
}
