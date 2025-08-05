import { CampaignAgent } from "../agents/campaign-agent";
import { CampaignContextAgent } from "../agents/campaign-context-agent";
import { CharacterSheetAgent } from "../agents/character-sheet-agent";
import { OnboardingAgent } from "../agents/onboarding-agent";
import { ResourceAgent } from "../agents/resource-agent";
import { AgentRouter, type AgentType } from "./agent-router";

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
  static initialize() {
    if (AgentRegistryService.initialized) {
      return;
    }

    console.log("[AgentRegistryService] Initializing agent registry...");

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

    console.log(
      "[AgentRegistryService] Agent registry initialized with",
      AgentRouter.getRegisteredAgentTypes().length,
      "agents"
    );
    AgentRegistryService.initialized = true;
  }

  /**
   * Get all registered agent types
   */
  static getRegisteredAgentTypes(): string[] {
    return AgentRouter.getRegisteredAgentTypes();
  }

  /**
   * Create an agent instance by type
   */
  static createAgentInstance(
    agentType: string,
    ctx: DurableObjectState,
    env: any,
    model?: any
  ): any {
    return AgentRouter.createAgentInstance(agentType, ctx, env, model);
  }

  /**
   * Get agent information
   */
  static getAgentInfo(agentType: AgentType) {
    const registry = AgentRouter.getAgentRegistry();
    return registry[agentType];
  }

  /**
   * Check if an agent type is registered
   */
  static isAgentRegistered(agentType: string): boolean {
    const registeredTypes = AgentRegistryService.getRegisteredAgentTypes();
    return registeredTypes.includes(agentType);
  }
}

// Auto-initialize when this module is imported
AgentRegistryService.initialize();
