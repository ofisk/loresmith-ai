import { streamText } from "ai";
import { ModelManager } from "./model-manager";
import { AgentNotRegisteredError } from "@/lib/errors";
import { AGENT_ROUTING_PROMPTS } from "./prompts/agent-routing-prompts";

export type AgentType =
  | "campaign"
  | "campaign-context"
  | "recap"
  | "campaign-analysis"
  | "character"
  | "character-sheets"
  | "entity-graph"
  | "onboarding"
  | "resources"
  | "session-digest"
  | "shards";

export interface AgentIntent {
  agent: AgentType;
  confidence: number;
  reason: string;
}

export interface AgentRegistry {
  [key: string]: {
    description: string;
    agentClass: any;
    tools: Record<string, any>;
    systemPrompt: string;
  };
}

export class AgentRouter {
  // Registry of available agents - automatically populated from BaseAgent classes
  private static agentRegistry: AgentRegistry = {};

  /**
   * Register an agent with the router
   */
  static registerAgent(
    agentType: AgentType,
    agentClass: any,
    tools: Record<string, any>,
    systemPrompt: string,
    description?: string
  ) {
    AgentRouter.agentRegistry[agentType] = {
      description: description || `Handles ${agentType} operations`,
      agentClass,
      tools,
      systemPrompt,
    };

    console.log(`[AgentRouter] Registered agent: ${agentType}`);
  }

  /**
   * Get all registered agent types
   */
  static getRegisteredAgentTypes(): string[] {
    return Object.keys(AgentRouter.agentRegistry);
  }

  /**
   * Get agent registry information
   */
  static getAgentRegistry(): AgentRegistry {
    return { ...AgentRouter.agentRegistry };
  }

  /**
   * Create an agent instance
   */
  static createAgentInstance(
    agentType: string,
    ctx: DurableObjectState,
    env: any,
    model?: any
  ): any {
    const agentInfo = AgentRouter.agentRegistry[agentType];
    if (!agentInfo) {
      throw new AgentNotRegisteredError(agentType);
    }

    // Use the provided model or get from global model manager
    const modelToUse = model || ModelManager.getInstance().getModel();
    return new agentInfo.agentClass(ctx, env, modelToUse);
  }

  /**
   * Get agent tools
   */
  static getAgentTools(agentType: string): Record<string, any> {
    const agentInfo = AgentRouter.agentRegistry[agentType];
    if (!agentInfo) {
      throw new AgentNotRegisteredError(agentType);
    }

    return agentInfo.tools;
  }

  /**
   * Get agent system prompt
   */
  static getAgentSystemPrompt(agentType: string): string {
    const agentInfo = AgentRouter.agentRegistry[agentType];
    if (!agentInfo) {
      throw new AgentNotRegisteredError(agentType);
    }

    return agentInfo.systemPrompt;
  }

  /**
   * Route a user message to the most appropriate agent using LLM-based analysis.
   *
   * This method uses the LLM to analyze the user's message against the descriptions
   * of all registered agents, making intelligent routing decisions based on:
   * - Agent capabilities and specializations
   * - User intent and request type
   * - Which agent's tools would be most relevant
   *
   * The LLM examines agent descriptions like:
   * - "resources: Manages PDF file uploads, file processing, metadata updates, and file ingestion..."
   * - "campaign: Handles campaign management, session planning, world building..."
   * - "onboarding: Provides guidance and help for new users..."
   *
   * And makes routing decisions based on these descriptions rather than hardcoded rules.
   *
   * @param userMessage - The user's message to route
   * @param recentContext - Optional recent context for routing decisions
   * @param ragService - Optional RAG service for enhanced routing
   * @returns Promise<AgentIntent> - The routing decision with agent, confidence, and reason
   */
  static async routeMessage(
    userMessage: string,
    recentContext?: string,
    _ragService?: any,
    model?: any
  ): Promise<AgentIntent> {
    // Build dynamic prompt based on registered agents
    const registeredAgents = AgentRouter.getRegisteredAgentTypes();
    const agentDescriptions = registeredAgents
      .map(
        (agentType) =>
          `- ${agentType}: ${AgentRouter.getAgentDescription(agentType)}`
      )
      .join("\n");

    const prompt = AGENT_ROUTING_PROMPTS.formatAgentRoutingPrompt(
      agentDescriptions,
      userMessage,
      recentContext,
      registeredAgents
    );

    try {
      // Use a simple LLM call to determine intent
      // This could be replaced with your actual LLM service
      const response = await AgentRouter.callLLM(prompt, model);
      const [agent, confidenceStr, reason] = response.split("|");

      // Validate that the agent is registered
      if (!registeredAgents.includes(agent)) {
        console.log(`[AgentRouter] Invalid agent '${agent}', using default`);
        return {
          agent: "resources" as AgentType,
          confidence: 30,
          reason: "Invalid agent, defaulting to resources",
        };
      }

      return {
        agent: agent as AgentType,
        confidence: parseInt(confidenceStr, 10) || 50,
        reason: reason || "LLM-based routing",
      };
    } catch (error) {
      console.log("[AgentRouter] LLM routing failed, using default:", error);

      // Default to resources for file-related operations
      return {
        agent: "resources" as AgentType,
        confidence: 30,
        reason: "LLM routing failed, defaulting to resources",
      };
    }
  }

  private static async callLLM(
    userMessage: string,
    model?: any
  ): Promise<string> {
    try {
      // Get all registered agents and their descriptions
      const registeredAgents = AgentRouter.getRegisteredAgentTypes();
      const agentDescriptions = registeredAgents
        .map((agentType) => {
          const description = AgentRouter.getAgentDescription(agentType);
          return `${agentType}: ${description}`;
        })
        .join("\n");

      // Create a generic system prompt that only uses agent descriptions
      const systemPrompt = `You are an intelligent router that determines which AI agent should handle a user's request.

Available agents and their capabilities:
${agentDescriptions}

Analyze the user's message and determine which agent would best serve their request. Consider the agent descriptions and user intent.

Respond with ONLY the agent type followed by a confidence score (0-100) and a brief reason, separated by pipes.

Example format: "agent_type|confidence|reason"`;

      // Use the provided model or get from global model manager
      const modelToUse = model || ModelManager.getInstance().getModel();

      // If no model is available, we can't route the message
      if (!modelToUse) {
        console.log(
          "[AgentRouter] No model available for routing, returning default agent"
        );
        return "campaign|50|No model available for routing, using default agent";
      }

      // Use streamText for the routing decision (single turn, no tools)
      const result = await streamText({
        model: modelToUse,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0,
      });

      // Extract the response text
      let responseText = "";
      for await (const chunk of result.textStream) {
        responseText += chunk;
      }

      const trimmedResponse = responseText.trim();
      console.log("[AgentRouter] LLM routing result:", trimmedResponse);
      return trimmedResponse;
    } catch (error) {
      console.error("[AgentRouter] LLM routing failed:", error);
      throw error;
    }
  }

  static getAgentDescription(agentType: string): string {
    const agentInfo = AgentRouter.agentRegistry[agentType];
    return agentInfo?.description || `Handles ${agentType} operations`;
  }
}
