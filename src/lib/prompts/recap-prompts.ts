import type { ContextRecapData } from "@/services/core/recap-service";
import { CAMPAIGN_PLANNING_CHECKLIST } from "@/lib/campaign-planning-checklist";

/**
 * Generate a prompt for the AI agent to create a friendly context recap message
 * @param recap - The context recap data containing recent activity, session digests, world state changes, and goals
 * @returns A formatted prompt string for the AI agent
 */
export function formatContextRecapPrompt(recap: ContextRecapData): string {
  // Build detailed session digest information
  const sessionDigestsDetails =
    recap.recentSessionDigests && recap.recentSessionDigests.length > 0
      ? recap.recentSessionDigests
          .map((digest) => {
            const sessionDate = digest.sessionDate
              ? new Date(digest.sessionDate).toLocaleDateString()
              : "No date";
            const keyEvents =
              digest.digestData?.last_session_recap?.key_events || [];
            const openThreads =
              digest.digestData?.last_session_recap?.open_threads || [];
            return `Session ${digest.sessionNumber} (${sessionDate}):\n  Key Events: ${keyEvents.length > 0 ? keyEvents.join("; ") : "None"}\n  Open Threads: ${openThreads.length > 0 ? openThreads.join("; ") : "None"}`;
          })
          .join("\n\n")
      : "";

  // Build world state changes summary
  const worldStateChangesSummary =
    recap.worldStateChanges && recap.worldStateChanges.length > 0
      ? recap.worldStateChanges
          .slice(0, 10)
          .map((entry) => {
            const changes: string[] = [];
            if (entry.payload.entity_updates?.length > 0) {
              changes.push(
                `${entry.payload.entity_updates.length} entity update(s)`
              );
            }
            if (entry.payload.relationship_updates?.length > 0) {
              changes.push(
                `${entry.payload.relationship_updates.length} relationship update(s)`
              );
            }
            if (entry.payload.new_entities?.length > 0) {
              changes.push(
                `${entry.payload.new_entities.length} new entity/entities`
              );
            }
            return `- ${new Date(entry.timestamp).toLocaleDateString()}: ${changes.join(", ") || "Unknown changes"}`;
          })
          .join("\n")
      : "";

  // Check if there's minimal campaign data
  const hasSessionDigests =
    recap.recentSessionDigests && recap.recentSessionDigests.length > 0;
  const hasWorldStateChanges =
    recap.worldStateChanges && recap.worldStateChanges.length > 0;
  const hasTodos =
    recap.inProgressGoals?.todoChecklist &&
    recap.inProgressGoals.todoChecklist.length > 0;
  const hasOpenThreads =
    recap.inProgressGoals?.openThreads &&
    recap.inProgressGoals.openThreads.length > 0;
  const hasMinimalData =
    !hasSessionDigests && !hasWorldStateChanges && !hasTodos && !hasOpenThreads;

  if (hasMinimalData) {
    return `This campaign is still in its early stages with minimal planning data.

Please provide a friendly welcome message and assess what's most important to work on next using this comprehensive campaign planning checklist:

${CAMPAIGN_PLANNING_CHECKLIST}

IMPORTANT: Before suggesting checklist items, use the searchCampaignContext tool to check if any of these items are already covered in the campaign data. Search for key checklist concepts like "campaign tone", "world name", "themes", "starting location", "factions", etc. to verify what's already been established.

Only recommend checklist items that you've verified are missing or incomplete through your search. Analyze what appears to be missing or incomplete based on the search results, and suggest 3-5 prioritized next steps from the checklist that would be most valuable to tackle. Focus on foundational elements first (Campaign Foundation, World & Setting Basics, Starting Location) before moving to later stages.

Be encouraging and helpful, framing these as exciting opportunities to build their campaign world. Prioritize based on logical dependencies (e.g., setting basics before factions, starting location before first arc, etc.).`;
  }

  return `Please provide a friendly context recap for this campaign. Here's what happened:

${recap.recentActivity && recap.recentActivity.length > 0 ? `Recent Activity (${recap.recentActivity.length} items):\n${recap.recentActivity.map((a) => `- ${a.type}: ${a.details || "N/A"}`).join("\n")}\n` : ""}

${sessionDigestsDetails ? `Recent Session Digests:\n${sessionDigestsDetails}\n\n` : ""}

${worldStateChangesSummary ? `World State Changes (${recap.worldStateChanges?.length || 0} total, showing first 10):\n${worldStateChangesSummary}\n` : ""}

${recap.inProgressGoals?.todoChecklist && recap.inProgressGoals.todoChecklist.length > 0 ? `In-Progress Todos:\n${recap.inProgressGoals.todoChecklist.map((todo) => `- ${todo}`).join("\n")}\n` : ""}

${recap.inProgressGoals?.openThreads && recap.inProgressGoals.openThreads.length > 0 ? `Open Story Threads:\n${recap.inProgressGoals.openThreads.map((thread) => `- ${thread}`).join("\n")}\n` : ""}

Please generate a friendly recap message starting directly with "Since you were away..." and summarizing the key highlights from the recent session digests, world state changes, and ongoing story threads. Do not include any introductory text or headings before the recap message - just provide the recap content itself.

After the recap, please also assess what would be most valuable to plan next using this comprehensive campaign planning checklist:

${CAMPAIGN_PLANNING_CHECKLIST}

IMPORTANT: Before suggesting checklist items, use the searchCampaignContext tool to verify what's already been established in the campaign. Search for key concepts related to any checklist items you're considering recommending (e.g., search for "campaign tone" if you're thinking of recommending tone definition, search for "factions" if recommending faction creation, etc.). Only recommend checklist items that are genuinely missing or incomplete based on your search results.

Based on the search results and current campaign state, suggest 2-3 prioritized next steps from the checklist that would be most valuable to tackle. Focus on what logically follows from where the campaign currently stands, and prioritize based on dependencies (e.g., setting basics before factions, starting location before first arc, etc.). Make sure your recommendations are informed by what actually exists in the campaign data, not assumptions.`;
}

export const RECAP_PROMPTS = {
  formatContextRecapPrompt,
};
