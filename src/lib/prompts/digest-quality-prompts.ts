/**
 * Session Digest Quality Assessment Prompts
 * Prompts for validating and assessing the quality of session digests
 */

import type { SessionDigestData } from "@/types/session-digest";

/**
 * Prompt for assessing relevance of digest content
 */
export function formatRelevanceAssessmentPrompt(
  digestData: SessionDigestData
): string {
  return `Review this session digest data and assess the relevance and quality of the content.

${JSON.stringify(digestData, null, 2)}

Provide a relevance score from 0-10 and list any issues where:
- Content seems irrelevant or off-topic
- Entries don't make sense for a D&D/TTRPG session digest
- Information appears to be placeholder or filler content
- Content quality is poor

Return JSON in this format:
{
  "score": 8,
  "issues": ["Issue 1", "Issue 2"]
}`;
}

/**
 * Prompt for assessing specificity of digest entries
 */
export function formatSpecificityAssessmentPrompt(
  digestData: SessionDigestData
): string {
  return `Review this session digest and assess the specificity of each entry. 
Entries should be concrete, specific, and actionable rather than vague or generic.

Session Digest:
${JSON.stringify(digestData, null, 2)}

For each entry in the digest, evaluate whether it is:
- Specific and concrete (e.g., "The party discovered a hidden chamber beneath [location] containing three ancient artifacts")
- Vague or generic (e.g., "Things happened", "Stuff occurred", "Various events", "etc.", "...", "and more")

Look for:
- Entries that lack detail or concrete information
- Generic phrases that don't convey meaningful information
- Placeholder-like content
- Entries that are too short to be useful
- Vague descriptions that don't help with campaign continuity

Provide a specificity score from 0-10 and list specific issues. Return JSON in this format:
{
  "score": 7,
  "issues": [
    "Vague entry in key_events: 'Things happened' - lacks specific details",
    "Generic entry in npcs_to_run: 'Some NPCs' - not specific enough",
    "Too short entry in state_changes.locations: 'Changes' - needs more detail"
  ]
}`;
}

/**
 * Prompt for assessing consistency between digest content and campaign entity graph
 */
export function formatConsistencyAssessmentPrompt(
  digestData: SessionDigestData,
  entityInfo: Array<{
    extractedEntity: { name: string; entityType: string };
    graphEntity: {
      id: string;
      name: string;
      entityType: string;
      content: unknown;
      relationships: Array<{
        type: string;
        target: string;
      }>;
    } | null;
  }>
): string {
  return `Compare the session digest content with the campaign's entity graph information to find inconsistencies.

Session Digest:
${JSON.stringify(digestData, null, 2)}

Entity Information from Campaign Graph:
${JSON.stringify(
  entityInfo.map((info) => ({
    mentionedInDigest: info.extractedEntity,
    foundInGraph: info.graphEntity
      ? {
          id: info.graphEntity.id,
          name: info.graphEntity.name,
          entityType: info.graphEntity.entityType,
          content: info.graphEntity.content,
          relationships: info.graphEntity.relationships.map((r) => ({
            type: r.type,
            target: r.target,
          })),
        }
      : null,
  })),
  null,
  2
)}

Find inconsistencies such as:
- Entities mentioned that don't exist in the campaign
- State changes that conflict with entity graph information
- NPCs marked as deceased but referenced as active
- Locations referenced that aren't in the campaign
- Relationships or facts that contradict entity graph data
- Other logical inconsistencies

Return JSON in this format:
{
  "issues": [
    "Description of inconsistency 1",
    "Description of inconsistency 2"
  ]
}`;
}

export const DIGEST_QUALITY_PROMPTS = {
  formatRelevanceAssessmentPrompt,
  formatSpecificityAssessmentPrompt,
  formatConsistencyAssessmentPrompt,
};
