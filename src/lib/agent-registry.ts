import type { AgentType } from "./agent-router";

/**
 * Agent Registry Service
 *
 * This service automatically registers all available agents with the AgentRouter.
 * When you add a new agent, simply import it here and register it.
 *
 * EXAMPLE: Adding a new agent
 *
 * 1. Create your agent class (extends BaseAgent):
 *    ```typescript
 *    // src/agents/my-new-agent.ts
 *    export class MyNewAgent extends BaseAgent {
 *      constructor(ctx: DurableObjectState, env: any, model: any) {
 *        super(ctx, env, model, myNewTools, MY_NEW_SYSTEM_PROMPT);
 *      }
 *    }
 *    ```
 *
 * 2. Add it to the registry here:
 *    ```typescript
 *    // In this file, add:
 *    import { MyNewAgent } from "../agents/my-new-agent";
 *    import { myNewTools } from "../tools/my-new-tools";
 *
 *    // In the initialize() method, add:
 *    AgentRouter.registerAgent(
 *      "my-new-agent" as AgentType,
 *      MyNewAgent,
 *      myNewTools,
 *      "My new agent system prompt",
 *      "Handles my new agent operations."
 *    );
 *    ```
 *
 * 3. Update the AgentType in agent-router.ts:
 *    ```typescript
 *    export type AgentType =
 *      | "campaign"
 *      | "campaign-context"
 *      | "character-sheets"
 *      | "resources"
 *      | "my-new-agent"; // Add your new agent type
 *    ```
 *
 * 4. The agent will be automatically:
 *    - Registered with the AgentRouter
 *    - Available for LLM-based routing
 *    - Discovered by the Chat durable object
 *    - Used with its description for agent selection
 *
 * That's it! The agent will be automatically discovered and used by the routing system.
 */
export class AgentRegistryService {
  private static initialized = false;

  /**
   * Initialize the agent registry with all available agents
   */
  static async initialize() {
    if (AgentRegistryService.initialized) {
      return;
    }

    console.log("[AgentRegistryService] Initializing agent registry...");

    try {
      // Lazy load agents to avoid module loading issues
      const { CampaignAgent } = await import("../agents/campaign-agent");
      const { CampaignContextAgent } = await import(
        "../agents/campaign-context-agent"
      );
      const { CharacterSheetAgent } = await import(
        "../agents/character-sheet-agent"
      );
      const { OnboardingAgent } = await import("../agents/onboarding-agent");
      const { ResourceAgent } = await import("../agents/resource-agent");
      const { ShardAgent } = await import("../agents/shard-agent");
      const { AgentRouter } = await import("./agent-router");

      // Register Campaign Agent
      AgentRouter.registerAgent(
        CampaignAgent.agentMetadata.type as AgentType,
        CampaignAgent,
        CampaignAgent.agentMetadata.tools,
        CampaignAgent.agentMetadata.systemPrompt,
        CampaignAgent.agentMetadata.description
      );

      // Register Campaign Context Agent
      AgentRouter.registerAgent(
        CampaignContextAgent.agentMetadata.type as AgentType,
        CampaignContextAgent,
        CampaignContextAgent.agentMetadata.tools,
        CampaignContextAgent.agentMetadata.systemPrompt,
        CampaignContextAgent.agentMetadata.description
      );

      // Register Character Sheet Agent
      AgentRouter.registerAgent(
        CharacterSheetAgent.agentMetadata.type as AgentType,
        CharacterSheetAgent,
        CharacterSheetAgent.agentMetadata.tools,
        CharacterSheetAgent.agentMetadata.systemPrompt,
        CharacterSheetAgent.agentMetadata.description
      );

      // Register Onboarding Agent
      AgentRouter.registerAgent(
        OnboardingAgent.agentMetadata.type as AgentType,
        OnboardingAgent,
        OnboardingAgent.agentMetadata.tools,
        OnboardingAgent.agentMetadata.systemPrompt,
        OnboardingAgent.agentMetadata.description
      );

      // Register Resource Agent
      AgentRouter.registerAgent(
        ResourceAgent.agentMetadata.type as AgentType,
        ResourceAgent,
        ResourceAgent.agentMetadata.tools,
        ResourceAgent.agentMetadata.systemPrompt,
        ResourceAgent.agentMetadata.description
      );

      // Register Shard Agent
      AgentRouter.registerAgent(
        ShardAgent.agentMetadata.type as AgentType,
        ShardAgent,
        ShardAgent.agentMetadata.tools,
        ShardAgent.agentMetadata.systemPrompt,
        ShardAgent.agentMetadata.description
      );

      AgentRegistryService.initialized = true;
      console.log(
        "[AgentRegistryService] Agent registry initialized successfully"
      );
    } catch (error) {
      console.error(
        "[AgentRegistryService] Error initializing agent registry:",
        error
      );
      throw error;
    }
  }

  /**
   * Get agent class by type
   */
  static async getAgentClass(agentType: AgentType) {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    const agentInfo = AgentRouter.getAgentRegistry()[agentType];
    return agentInfo?.agentClass;
  }

  /**
   * Get agent tools by type
   */
  static async getAgentTools(agentType: AgentType) {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    return AgentRouter.getAgentTools(agentType);
  }

  /**
   * Get agent system prompt by type
   */
  static async getAgentSystemPrompt(agentType: AgentType) {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    return AgentRouter.getAgentSystemPrompt(agentType);
  }

  /**
   * Get agent description by type
   */
  static async getAgentDescription(agentType: AgentType) {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    return AgentRouter.getAgentDescription(agentType);
  }

  /**
   * Get all registered agent types
   */
  static async getRegisteredAgentTypes() {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    return AgentRouter.getRegisteredAgentTypes();
  }

  /**
   * Check if agent type is registered
   */
  static async isAgentTypeRegistered(agentType: AgentType) {
    if (!AgentRegistryService.initialized) {
      await AgentRegistryService.initialize();
    }

    const { AgentRouter } = await import("./agent-router");
    const registeredTypes = AgentRouter.getRegisteredAgentTypes();
    return registeredTypes.includes(agentType);
  }
}
