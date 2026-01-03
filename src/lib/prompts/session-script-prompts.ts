/**
 * Session Script Generation Prompts
 * Prompts for generating detailed, actionable session scripts for game masters
 */

export interface SessionScriptContext {
  campaignName: string;
  sessionTitle: string;
  sessionType: "combat" | "social" | "exploration" | "mixed";
  estimatedDuration: number;
  focusAreas?: string[];
  recentSessionDigests: Array<{
    sessionNumber: number;
    sessionDate: string | null;
    keyEvents: string[];
    openThreads: string[];
    stateChanges: {
      factions: string[];
      locations: string[];
      npcs: string[];
    };
    nextSessionPlan?: {
      objectives_dm: string[];
      probable_player_goals: string[];
      beats: string[];
      if_then_branches: string[];
    };
  }>;
  relevantEntities: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
    description?: string;
    relationships?: Array<{
      targetName: string;
      relationshipType: string;
    }>;
  }>;
  characterBackstories?: Array<{
    name: string;
    backstory?: string;
    goals?: string[];
  }>;
  campaignResources?: Array<{
    title: string;
    type: string;
  }>;
  isOneOff?: boolean;
}

/**
 * Session script prompt template
 * This is the core prompt body that gets populated with dynamic context
 */
function buildSessionScriptPromptBody(params: {
  campaignName: string;
  sessionTitle: string;
  sessionType: string;
  estimatedDuration: number;
  focusAreas: string;
  isOneOffNote: string;
  sessionContext: string;
  entityContext: string;
  characterContext: string;
  campaignResourcesSection: string;
  endGoalInstruction: string;
}): string {
  const {
    campaignName,
    sessionTitle,
    sessionType,
    estimatedDuration,
    focusAreas,
    isOneOffNote,
    sessionContext,
    entityContext,
    characterContext,
    campaignResourcesSection,
    endGoalInstruction,
  } = params;

  return `You are an expert game master assistant creating a detailed, actionable session script for a tabletop roleplaying game campaign.

## Campaign Context

Campaign: ${campaignName}
Session Title: ${sessionTitle}
Session Type: ${sessionType}
Estimated Duration: ${estimatedDuration} hours
${focusAreas}
${isOneOffNote}

## Recent Session History

${sessionContext}

## Relevant Entities (NPCs, Locations, Items)

${entityContext}

## Player Characters

${characterContext}

${campaignResourcesSection}

## CRITICAL REQUIREMENTS

Your session script MUST include all of the following:

### 1. Session End Goal
${endGoalInstruction}

### 2. Flexible Sub-Goals
Provide 3-5 loose and flexible sub-goals that can be achieved in multiple ways. These should NOT be railroaded - players should have multiple paths to achieve them. Examples:
- "Get the X magic item to character Y for their personal quest" (could be through negotiation, theft, quest completion, etc.)
- "Introduce the side villain of this part of the story" (could happen through investigation, encounter, revelation, etc.)
- "Discover information about the ancient ruins" (could be through exploration, NPC interaction, research, etc.)

For each sub-goal, suggest 2-3 different ways players might achieve it.

### 3. Detailed NPC Information
For EVERY NPC that will be introduced or featured in the session, provide:
- **Physical Description**: Detailed appearance that helps the GM visualize and describe them
- **Personality & Quirks**: Distinct traits that make them memorable (speech patterns, habits, mannerisms)
- **Reactions to Players**: How they typically respond to different types of player actions (friendly, hostile, cautious, etc.)
- **Information They Know**: What knowledge, secrets, or clues they possess
- **Example Dialogue**: 3-5 example lines of dialogue that capture their voice
- **Motivations & Goals**: What drives them and what they want
- **How to Make Them Memorable**: Specific tips for roleplaying them effectively

### 4. Well-Fleshed Location Descriptions
For EVERY important location in the session, provide:
- **Ready-to-Read Description**: A complete description meant to be read directly to players, including:
  - Visual details (what they see)
  - Sensory details (sounds, smells, textures, temperature)
  - Atmospheric mood
  - Key features and points of interest
- **Tone Suggestions**: The emotional tone/mood of the location (e.g., "ominous and foreboding", "warm and welcoming", "tense and uncertain")
- **Music/Ambiance Suggestions**: Recommended music or soundscape themes (optional but helpful)
- **Key Features**: Notable elements players should notice

### 5. Scene Structure
Organize the session into clear scenes with:
- **Scene Titles**: Descriptive titles for each major scene
- **Setup**: Atmospheric descriptions ready to read to players
- **Choices**: Player decision points with multiple options (not railroaded)
- **Encounters**: Detailed encounter descriptions (combat, social, exploration, or skill challenges)
- **Character Tie-Ins**: Specific moments tailored to individual player characters
- **NPC Interactions**: Dialogue prompts and conversation areas
- **Branching Paths**: If-then scenarios showing consequences of different player choices
- **Session Climax**: A memorable ending moment
- **Session Resolution**: Wrap-up and hooks for the next session

## Formatting Guidelines

- Use markdown formatting with clear headings and subheadings
- Use quotes (["]) to mark text meant to be read directly to players
- Use checkboxes ([ ] or [x]) for tracking completed elements
- Include character-specific moments clearly marked with character names
- Use clear scene separators (---)
- Make descriptions vivid and immersive
- Ensure flexibility - players should have multiple paths, not a single railroad

## Output Format

Generate a complete session script in markdown format following this structure:

# ${sessionTitle}

## Session Overview
- **End Goal**: [Clear goal relating to campaign arc or self-contained for one-off]
- **Sub-Goals**: [List of flexible sub-goals with multiple achievement paths]
- **Estimated Duration**: ${estimatedDuration} hours

## Session Script

### Scene 1: [Scene Title]
#### Setup:
- ["] [Ready-to-read description for players]

#### Sub-Goals in This Scene:
- [List relevant sub-goals]

#### Location: [Location Name]
[Detailed location description with tone/music suggestions]

#### NPCs Featured:
[For each NPC, provide all required details: description, quirks, reactions, dialogue examples, motivations]

#### Choices:
[Player decision points with multiple options]

#### Character Tie-Ins:
- **[Character Name]**: [Specific moment for this character]

#### Encounters:
[Detailed encounter descriptions]

#### Branching Paths:
- **If players choose X**: [Consequence]
- **If players choose Y**: [Consequence]

[Continue with additional scenes...]

### Session Climax
[Memorable ending moment]

### Session Resolution
[Wrap-up and next session hooks]

Generate the complete session script now, ensuring all requirements are met.`;
}

/**
 * Generate a comprehensive prompt for creating a detailed session script
 */
export function formatSessionScriptPrompt(
  context: SessionScriptContext
): string {
  const {
    campaignName,
    sessionTitle,
    sessionType,
    estimatedDuration,
    focusAreas,
    recentSessionDigests,
    relevantEntities,
    characterBackstories,
    campaignResources,
    isOneOff,
  } = context;

  // Build recent session context
  const sessionContext =
    recentSessionDigests.length > 0
      ? recentSessionDigests
          .slice(-3) // Last 3 sessions
          .map((digest) => {
            const date = digest.sessionDate
              ? new Date(digest.sessionDate).toLocaleDateString()
              : "No date";
            return `Session ${digest.sessionNumber} (${date}):
  Key Events: ${digest.keyEvents.join("; ") || "None"}
  Open Threads: ${digest.openThreads.join("; ") || "None"}
  State Changes - Factions: ${digest.stateChanges.factions.join(", ") || "None"}
  State Changes - Locations: ${digest.stateChanges.locations.join(", ") || "None"}
  State Changes - NPCs: ${digest.stateChanges.npcs.join(", ") || "None"}
  ${
    digest.nextSessionPlan
      ? `Next Session Plan:
    DM Objectives: ${digest.nextSessionPlan.objectives_dm.join("; ") || "None"}
    Player Goals: ${digest.nextSessionPlan.probable_player_goals.join("; ") || "None"}
    Beats: ${digest.nextSessionPlan.beats.join("; ") || "None"}`
      : ""
  }`;
          })
          .join("\n\n")
      : "No previous sessions recorded";

  // Build entity context
  const entityContext =
    relevantEntities.length > 0
      ? relevantEntities
          .map((entity) => {
            const relationships = entity.relationships
              ? entity.relationships
                  .map(
                    (rel) =>
                      `  - ${rel.relationshipType} with ${rel.targetName}`
                  )
                  .join("\n")
              : "";
            return `${entity.entityName} (${entity.entityType})${entity.description ? `: ${entity.description}` : ""}${relationships ? `\n${relationships}` : ""}`;
          })
          .join("\n\n")
      : "No relevant entities found";

  // Build character context
  const characterContext =
    characterBackstories && characterBackstories.length > 0
      ? characterBackstories
          .map((char) => {
            const goals =
              char.goals && char.goals.length > 0
                ? `\n  Goals: ${char.goals.join(", ")}`
                : "";
            return `${char.name}${char.backstory ? `\n  Backstory: ${char.backstory}` : ""}${goals}`;
          })
          .join("\n\n")
      : "No character backstories available";

  // Build campaign resources section
  const campaignResourcesSection =
    campaignResources && campaignResources.length > 0
      ? `## Campaign Resources Available

${campaignResources.map((r) => `- ${r.title} (${r.type})`).join("\n")}

These resources may contain relevant information for the session. Reference them when appropriate.`
      : "";

  // Build focus areas string
  const focusAreasStr =
    focusAreas && focusAreas.length > 0
      ? `Focus Areas: ${focusAreas.join(", ")}`
      : "";

  // Build one-off note
  const isOneOffNote = isOneOff
    ? "NOTE: This is a one-off session (shopping, side quest, seasonal, etc.) and does not need to connect to the main campaign arc."
    : "";

  // Build end goal instruction
  const endGoalInstruction = isOneOff
    ? "Since this is a one-off session, create a self-contained goal that provides a satisfying experience within the session."
    : "Create a clear end goal for the session that relates back to the larger campaign arc. This should be something achievable by the end of the session that advances the overall story.";

  return buildSessionScriptPromptBody({
    campaignName,
    sessionTitle,
    sessionType,
    estimatedDuration,
    focusAreas: focusAreasStr,
    isOneOffNote,
    sessionContext,
    entityContext,
    characterContext,
    campaignResourcesSection,
    endGoalInstruction,
  });
}

export const SESSION_SCRIPT_PROMPTS = {
  formatSessionScriptPrompt,
};
