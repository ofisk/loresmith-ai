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

MANDATORY WORKFLOW: Before suggesting ANY checklist items, you MUST follow this exact workflow:

1. FIRST, call getChecklistStatus to retrieve the structured status and summaries for all tracked checklist items. This is the PRIMARY source of truth - it contains asynchronously generated status (complete/partial/incomplete) and summaries for each checklist item based on entity counts, community analysis, and metadata. Use this structured data as your main reference.

2. THEN, call showCampaignDetails to retrieve the campaign's description and metadata. Use this as a SUPPLEMENTARY source to cross-reference with getChecklistStatus results. The metadata may contain additional fields that indicate completed items, or it may confirm what getChecklistStatus already shows.

3. THEN, synthesize both sources:
   - PRIMARY: Use getChecklistStatus results - items marked as "complete" or "partial" are ALREADY ESTABLISHED and must NOT be recommended
   - SUPPLEMENTARY: Use showCampaignDetails metadata to identify any additional completed items that might not yet be tracked in getChecklistStatus
   - If either source shows an item is already established, that item is COMPLETE and must NOT be recommended

4. FINALLY, only suggest checklist items that are missing or incomplete according to your synthesis. You may do 1-2 targeted searches using searchCampaignContext ONLY if you need to verify a specific item's status that's unclear from getChecklistStatus and metadata, but limit yourself to 1-2 searches maximum to prevent context overflow.

CRITICAL: DO NOT include any checklist items that are already completed in your recommendations. DO NOT acknowledge completed items with phrases like "You've already established..." or "You've already selected...". Only list items that are missing or incomplete. Dynamically determine what's already set by analyzing the metadata and context, then skip those items entirely.

SAVING NEXT STEPS: When you suggest next steps, they must be saved so they appear in Campaign Details. (1) FIRST call getPlanningTaskProgress (campaignId and JWT are supplied automatically). If there are open (pending/in_progress) tasks, present those and tell the user they can view them in Campaign Details under the Next steps tab—do NOT call recordPlanningTasks. (2) If there are NO open tasks, after suggesting 3-5 next steps you MUST call recordPlanningTasks with those tasks (each with "title" and optional "description"). Campaign ID and JWT are injected automatically—you only need to pass the tasks array. Do not say "these have been saved" in your reply without having called recordPlanningTasks; after the tool succeeds, tell the user: "These have been saved to your campaign. You can view and manage them in Campaign Details under the Next steps tab."

Analyze what appears to be missing or incomplete based on the search results, and suggest 3-5 prioritized next steps from the checklist that would be most valuable to tackle. Focus on foundational elements first (Campaign Foundation, World & Setting Basics, Starting Location) before moving to later stages.

Be encouraging and helpful, framing these as exciting opportunities to build their campaign world. Prioritize based on logical dependencies (e.g., setting basics before factions, starting location before first arc, etc.).`;
  }

  return `CONTEXT RECAP MODE: You must write the recap narrative using ONLY the data in this message. Do NOT call searchCampaignContext or listAllEntities for the recap. Only after you have written the full "Since you were away..." recap and the Open Threads may you call any tools (getPlanningTaskProgress, getChecklistStatus, showCampaignDetails, recordPlanningTasks) for the Next Steps section.

Please provide a friendly context recap for this campaign.

DATA PROVIDED FOR THE RECAP (use this as the source for your narrative—do not replace it with tool output):
${recap.recentActivity && recap.recentActivity.length > 0 ? `Recent Activity (${recap.recentActivity.length} items):\n${recap.recentActivity.map((a) => `- ${a.type}: ${a.details || "N/A"}`).join("\n")}\n` : ""}

${sessionDigestsDetails ? `Recent Session Digests:\n${sessionDigestsDetails}\n\n` : ""}

${worldStateChangesSummary ? `World State Changes (${recap.worldStateChanges?.length || 0} total, showing first 10):\n${worldStateChangesSummary}\n` : ""}

${recap.inProgressGoals?.todoChecklist && recap.inProgressGoals.todoChecklist.length > 0 ? `In-Progress Todos:\n${recap.inProgressGoals.todoChecklist.map((todo) => `- ${todo}`).join("\n")}\n` : ""}

${recap.inProgressGoals?.openThreads && recap.inProgressGoals.openThreads.length > 0 ? `Open Story Threads:\n${recap.inProgressGoals.openThreads.map((thread) => `- ${thread}`).join("\n")}\n` : ""}

RECAP NARRATIVE (do this first, using only the data above):
Write a friendly recap that starts with "Since you were away..." and then:
- If Recent Session Digests or Open Story Threads are present above: summarize each session using Key Events and Open Threads, and present open threads as questions or hooks (e.g. "Will the villain's plan succeed? What is the key NPC's connection to the prophecy?").
- If there are no session digests and no open threads above: say briefly that no recent session recap was found and suggest recording a session digest for better recaps next time; then move on to Next Steps. Do NOT say "608 entries" or "would you like me to search?"—that is not a recap.
- Do NOT call searchCampaignContext or listAllEntities for the recap. Do NOT mention "entity count" or "no specific details retrieved". Start directly with the recap content (no extra heading).

After the recap narrative, add a "Next Steps for Planning" section. To choose those next steps, follow this workflow:

${CAMPAIGN_PLANNING_CHECKLIST}

MANDATORY WORKFLOW: Before suggesting ANY checklist items, you MUST follow this exact workflow:

1. FIRST, call getChecklistStatus to retrieve the structured status and summaries for all tracked checklist items. This is the PRIMARY source of truth - it contains asynchronously generated status (complete/partial/incomplete) and summaries for each checklist item based on entity counts, community analysis, and metadata. Use this structured data as your main reference.

2. THEN, call showCampaignDetails to retrieve the campaign's description and metadata. Use this as a SUPPLEMENTARY source to cross-reference with getChecklistStatus results. The metadata may contain additional fields that indicate completed items, or it may confirm what getChecklistStatus already shows.

3. THEN, synthesize both sources:
   - PRIMARY: Use getChecklistStatus results - items marked as "complete" or "partial" are ALREADY ESTABLISHED and must NOT be recommended
   - SUPPLEMENTARY: Use showCampaignDetails metadata to identify any additional completed items that might not yet be tracked in getChecklistStatus
   - If either source shows an item is already established, that item is COMPLETE and must NOT be recommended

4. FINALLY, only suggest checklist items that are missing or incomplete according to your synthesis. You may do 1-2 targeted searches using searchCampaignContext ONLY if you need to verify a specific item's status that's unclear from getChecklistStatus and metadata, but limit yourself to 1-2 searches maximum to prevent context overflow.

CRITICAL: DO NOT include any checklist items that are already completed in your recommendations. DO NOT acknowledge completed items with phrases like "You've already established..." or "You've already selected...". Only list items that are missing or incomplete. Dynamically determine what's already set by analyzing the metadata and context, then skip those items entirely.

SAVING NEXT STEPS: When you suggest next steps, they must be saved so they appear in Campaign Details. (1) FIRST call getPlanningTaskProgress (campaignId and JWT are supplied automatically). If there are open (pending/in_progress) tasks, present those and tell the user they can view them in Campaign Details under the Next steps tab—do NOT call recordPlanningTasks. (2) If there are NO open tasks, after suggesting 2-3 next steps you MUST call recordPlanningTasks with those tasks (each with "title" and optional "description"). Campaign ID and JWT are injected automatically—you only need to pass the tasks array. Do not say "these have been saved" in your reply without having called recordPlanningTasks; after the tool succeeds, tell the user: "These have been saved to your campaign. You can view and manage them in Campaign Details under the Next steps tab."

Based on the search results and current campaign state, suggest 2-3 prioritized next steps. Prefer concrete, story-relevant items (e.g. "Key NPC's character and motivations", "Political factions in the main hub") that tie to the recap narrative; use the checklist for ideas but phrase steps so they are specific to this campaign. Focus on what logically follows from where the campaign currently stands. Make sure your recommendations are informed by what actually exists in the campaign data, not assumptions. Then save the suggested next steps using the recordPlanningTasks tool (see SAVING NEXT STEPS above) so they appear in Campaign Details and the user is notified.`;
}

export const RECAP_PROMPTS = {
  formatContextRecapPrompt,
};
