/**
 * Parses the campaign ID from a conversation ID.
 * Conversation ID format: `{username}-campaign-{campaignId}` (or `...-none` when no campaign selected).
 */
export function getCampaignIdFromConversationId(
	conversationId: string | null | undefined
): string | null {
	if (typeof conversationId !== "string" || conversationId.length === 0) {
		return null;
	}
	const suffix = "-campaign-";
	const idx = conversationId.lastIndexOf(suffix);
	if (idx === -1) return null;
	const campaignId = conversationId.slice(idx + suffix.length);
	return campaignId === "none" ? null : campaignId;
}
