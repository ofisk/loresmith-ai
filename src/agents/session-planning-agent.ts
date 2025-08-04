import { sessionPlanningTools } from "../tools/session-planning";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

/**
 * System prompt configuration for the Session Planning Agent.
 * Defines the agent's role, responsibilities, and available tools.
 */
const SESSION_PLANNING_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Session Planning Agent",
  responsibilities: [
    "Session Script Generation: Create detailed, flexible session scripts with scenes, descriptions, and player interactions",
    "Session Goals Determination: Work with campaign context to determine appropriate session goals when not provided by user",
    "Character Arc Analysis: Analyze how each player character can advance their story during the session",
    "Campaign Progression Analysis: Understand how this session fits into the overall campaign goals and progression",
    "Campaign Context Analysis: Analyze campaign context to identify available information and missing elements",
    "Session Requirements Validation: Ensure campaigns have sufficient context before generating scripts",
    "Template Management: Provide session script templates and examples for different campaign types",
    "Context Integration: Pull from campaign context, character sheets, and module information to create comprehensive scripts",
  ],
  tools: createToolMappingFromObjects(sessionPlanningTools),
  workflowGuidelines: [
    "Goals Analysis: Determine session goals based on campaign context and progression when not provided",
    "Character Arc Planning: Analyze how each character can advance their story during the session",
    "Campaign Progression: Understand how this session contributes to overall campaign goals",
    "Context Analysis: Analyze the campaign context to understand available information",
    "Requirements Validation: Validate that sufficient context exists for script generation",
    "Script Generation: Create detailed, step-by-step session scripts with flexible scenes",
    "Template Integration: Use appropriate templates and examples to guide script structure",
    "Context Integration: Integrate campaign context, character information, and module details",
  ],
  importantNotes: [
    "Always determine session goals first - either from user input or by analyzing campaign context and progression",
    "Analyze character arcs to ensure each player character has opportunities to advance their story",
    "Understand how this session fits into the overall campaign progression and goals",
    "If campaign context is insufficient, guide users to add missing information through campaign or campaign-context agents",
    "Generate scripts that are flexible and allow for player agency while providing clear structure",
    "Include detailed scene descriptions, player interaction opportunities, and potential outcomes",
    "Reference campaign context, character information, and module details in script generation",
    "Provide step-by-step guidance that doesn't require memorizing full campaign context",
    "Include character-specific moments and opportunities for player spotlight",
    "Structure scripts with clear scenes, setup, choices, and resolution points",
  ],
  specialization: `You specialize in creating comprehensive session scripts that help DMs run engaging sessions without needing to memorize all campaign details. Your scripts should be:

1. **Goal-Oriented**: Determine session goals based on campaign context and progression when not provided by users
2. **Character-Driven**: Analyze character arcs to ensure each player advances their story during the session
3. **Campaign-Integrated**: Understand how each session fits into the overall campaign progression and goals
4. **Flexible but Structured**: Provide clear scenes and descriptions while allowing for player agency
5. **Context-Aware**: Pull from campaign context, character sheets, and module information
6. **Step-by-Step**: Include detailed descriptions, dialogue prompts, and interaction opportunities
7. **Character-Focused**: Include character-specific moments and spotlight opportunities
8. **Comprehensive**: Cover setup, scenes, choices, combat, roleplay, and resolution

You should first determine session goals (from user or campaign analysis), analyze character arcs, understand campaign progression, then analyze campaign context, validate requirements, and generate comprehensive scripts. If context is missing, guide users to add the necessary information through other agents.`,
});

/**
 * Session Planning Agent for LoreSmith AI.
 *
 * This agent specializes in generating comprehensive session scripts that help DMs
 * run engaging sessions without needing to memorize all campaign details. It creates
 * flexible, step-by-step scripts with detailed scenes, descriptions, and player
 * interactions based on campaign context.
 *
 * The agent analyzes campaign context, validates requirements, and generates scripts
 * that integrate character information, world details, and module content. It provides
 * templates and examples for different session types and campaign styles.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a session agent instance
 * const sessionAgent = new SessionAgent(ctx, env, model);
 *
 * // Process a session planning message
 * await sessionAgent.onChatMessage((response) => {
 *   console.log('Session response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various session planning tasks:
 * // - "Generate a session script for session 5 of my Curse of Strahd campaign"
 * // - "Analyze my campaign context for session planning"
 * // - "Create a combat-heavy session script for my party"
 * // - "Show me session script templates"
 * // - "Validate that I have enough context for session planning"
 * ```
 */
export class SessionPlanningAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "session-planning",
    description:
      "Generates comprehensive session scripts with scenes, descriptions, and player interactions based on campaign context. Analyzes campaign context and validates requirements before creating scripts.",
    systemPrompt: SESSION_PLANNING_SYSTEM_PROMPT,
    tools: sessionPlanningTools,
  };

  /**
   * Creates a new SessionAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, sessionPlanningTools);
  }
}
