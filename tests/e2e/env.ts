/** Longer waits on CI (cold runners, large client bundle parse). */
export const E2E_UI_TIMEOUT_MS = process.env.CI ? 45_000 : 12_000;
