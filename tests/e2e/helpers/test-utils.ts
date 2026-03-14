/** Generate a unique campaign name for E2E tests to avoid collisions when running in parallel. */
export function uniqueCampaignName(prefix: string): string {
	return `${prefix}-${Date.now()}`;
}
