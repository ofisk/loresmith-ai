import { useCallback } from "react";

const LAST_ACTIVITY_STORAGE_KEY = "loresmith-last-activity";
const RECAP_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get the last recap timestamp for a specific campaign
 */
export function getLastRecapTimestamp(campaignId: string): number | null {
  const key = `loresmith-recap-${campaignId}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

/**
 * Set the last recap timestamp for a specific campaign
 */
export function setLastRecapTimestamp(
  campaignId: string,
  timestamp: number
): void {
  const key = `loresmith-recap-${campaignId}`;
  localStorage.setItem(key, timestamp.toString());
}

/**
 * Check if a recap should be shown for a campaign
 * Returns true if no recap has been shown for this campaign OR > 1 hour since last recap
 */
export function shouldShowRecap(campaignId: string | null): boolean {
  if (!campaignId) {
    return false;
  }

  const lastRecap = getLastRecapTimestamp(campaignId);
  if (!lastRecap) {
    // No recap shown yet for this campaign
    return true;
  }

  const now = Date.now();
  const timeSinceLastRecap = now - lastRecap;
  return timeSinceLastRecap >= RECAP_COOLDOWN_MS;
}

/**
 * Get the last activity timestamp
 */
export function getLastActivityTimestamp(): number | null {
  const stored = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
  return stored ? parseInt(stored, 10) : null;
}

/**
 * Update the last activity timestamp to now
 */
export function updateActivityTimestamp(): void {
  localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, Date.now().toString());
}

/**
 * Check if user has been away for more than the inactivity threshold
 */
export function hasBeenAway(thresholdMs: number = RECAP_COOLDOWN_MS): boolean {
  const lastActivity = getLastActivityTimestamp();
  if (!lastActivity) {
    // No activity recorded, consider user as returning
    return true;
  }

  const now = Date.now();
  const timeSinceActivity = now - lastActivity;
  return timeSinceActivity >= thresholdMs;
}

/**
 * Hook for activity tracking
 * Provides functions to update activity and check if recaps should be shown
 */
export function useActivityTracking() {
  const updateActivity = useCallback(() => {
    updateActivityTimestamp();
  }, []);

  const checkShouldShowRecap = useCallback(
    (campaignId: string | null): boolean => {
      return shouldShowRecap(campaignId);
    },
    []
  );

  const markRecapShown = useCallback((campaignId: string) => {
    setLastRecapTimestamp(campaignId, Date.now());
  }, []);

  const checkHasBeenAway = useCallback((thresholdMs?: number): boolean => {
    return hasBeenAway(thresholdMs);
  }, []);

  return {
    updateActivity,
    checkShouldShowRecap,
    markRecapShown,
    checkHasBeenAway,
  };
}
