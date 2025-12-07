/**
 * Planning Context Search Prompts
 * Prompts for entity name extraction in planning context search
 */

/**
 * Generate prompt for extracting entity names from a query
 */
export function formatEntityExtractionPrompt(query: string): string {
  return `Extract entity names from this query about a tabletop game campaign. Entity names include:
- Character names (NPCs, player characters)
- Location names (cities, landmarks, places)
- Item names (equipment, artifacts, objects)
- Organization names (guilds, factions, groups)
- Any other proper nouns that might be entities in a campaign

Query: "${query}"

Return a JSON object with an "entityNames" array containing the extracted names. If no entity names are found, return an empty array.

Example response:
{
  "entityNames": ["CharacterName", "LocationName", "ItemName"]
}`;
}

export const PLANNING_CONTEXT_PROMPTS = {
  formatEntityExtractionPrompt,
};
