/**
 * Metadata Analysis Prompts
 * Prompts for analyzing campaign metadata against checklist items
 */

export interface ChecklistItem {
  key: string;
  description: string;
}

/**
 * Generate prompt for analyzing campaign metadata against checklist items
 */
export function formatMetadataAnalysisPrompt(
  checklistItems: readonly ChecklistItem[],
  metadata: Record<string, unknown>,
  campaignDescription?: string
): string {
  const checklistItemsText = checklistItems
    .map((item) => `- ${item.key}: ${item.description}`)
    .join("\n");

  const metadataJson = JSON.stringify(metadata, null, 2);
  const descriptionText = campaignDescription
    ? `\n\nCampaign Description:\n${campaignDescription}`
    : "";

  return `Analyze the following campaign metadata and determine which checklist items are adequately covered.

Checklist Items:
${checklistItemsText}

Campaign Metadata (JSON):
${metadataJson}${descriptionText}

For each checklist item, determine if the metadata (or campaign description) contains sufficient information to consider that item "covered". A checklist item is covered if:
1. The metadata contains relevant information that addresses the checklist item's description
2. The information is specific and actionable (not just placeholder text)
3. The information is stored in any field name format (camelCase, snake_case, kebab-case, etc.)

Return a JSON object with a "coverage" field mapping each checklist item key to true if covered, false if not.

Example response:
{
  "coverage": {
    "world_name": true,
    "starting_location": true,
    "campaign_tone": false,
    "core_themes": false,
    ...
  }
}`;
}

export const METADATA_ANALYSIS_PROMPTS = {
  formatMetadataAnalysisPrompt,
};
