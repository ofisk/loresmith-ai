import type { SessionDigestData } from "@/types/session-digest";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { getDAOFactory } from "@/dao/dao-factory";
import {
  formatRelevanceAssessmentPrompt,
  formatSpecificityAssessmentPrompt,
  formatConsistencyAssessmentPrompt,
} from "@/lib/prompts/digest-quality-prompts";

export interface DigestQualityResult {
  score: number; // 0-10
  completeness: {
    score: number; // 0-10
    issues: string[];
  };
  specificity: {
    score: number; // 0-10
    issues: string[];
  };
  consistency: {
    score: number; // 0-10
    issues: string[];
  };
  relevance: {
    score: number; // 0-10
    issues: string[];
  };
}

export interface DigestQualityServiceOptions {
  openaiApiKey?: string;
  db?: D1Database;
  vectorize?: VectorizeIndex;
  env?: any;
}

export class DigestQualityService {
  private readonly openaiApiKey?: string;
  private readonly db?: D1Database;
  private readonly vectorize?: VectorizeIndex;
  private readonly env?: any;

  constructor(options: DigestQualityServiceOptions = {}) {
    this.openaiApiKey = options.openaiApiKey;
    this.db = options.db;
    this.vectorize = options.vectorize;
    this.env = options.env;
  }

  /**
   * Validate digest quality and calculate a quality score
   */
  async validateDigestQuality(
    digestData: SessionDigestData,
    campaignId?: string
  ): Promise<DigestQualityResult> {
    const completeness = this.checkCompleteness(digestData);

    // Specificity check requires LLM, so it's optional
    let specificity = { score: 10, issues: [] as string[] };
    if (this.openaiApiKey) {
      try {
        specificity = await this.checkSpecificity(digestData);
      } catch (error) {
        console.warn(
          "[DigestQualityService] Failed to check specificity:",
          error
        );
        // Don't fail if specificity check fails, just skip it
      }
    }

    const consistency = await this.checkConsistency(digestData, campaignId);

    // Relevance check requires LLM, so it's optional
    let relevance = { score: 10, issues: [] as string[] };
    if (this.openaiApiKey) {
      try {
        relevance = await this.checkRelevance(digestData);
      } catch (error) {
        console.warn(
          "[DigestQualityService] Failed to check relevance:",
          error
        );
        // Don't fail if relevance check fails, just skip it
      }
    }

    // Calculate overall score (weighted average)
    // Completeness: 40%, Specificity: 30%, Consistency: 20%, Relevance: 10%
    const overallScore =
      completeness.score * 0.4 +
      specificity.score * 0.3 +
      consistency.score * 0.2 +
      relevance.score * 0.1;

    return {
      score: Math.round(overallScore * 10) / 10, // Round to 1 decimal place
      completeness,
      specificity,
      consistency,
      relevance,
    };
  }

  /**
   * Calculate quality score (shorthand method)
   */
  async calculateQualityScore(
    digestData: SessionDigestData,
    campaignId?: string
  ): Promise<number> {
    const result = await this.validateDigestQuality(digestData, campaignId);
    return result.score;
  }

  /**
   * Check completeness - ensures required sections have content
   */
  private checkCompleteness(digestData: SessionDigestData): {
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let filledSections = 0;
    const totalSections = 12; // Total number of array fields

    // Check key events
    if (
      digestData.last_session_recap.key_events.length === 0 ||
      digestData.last_session_recap.key_events.every((e) => !e.trim())
    ) {
      issues.push("No key events provided");
    } else {
      filledSections++;
    }

    // Check state changes - at least one should have entries
    const hasStateChanges =
      digestData.last_session_recap.state_changes.factions.length > 0 ||
      digestData.last_session_recap.state_changes.locations.length > 0 ||
      digestData.last_session_recap.state_changes.npcs.length > 0;
    if (!hasStateChanges) {
      issues.push("No state changes recorded");
    } else {
      filledSections++;
    }

    // Check open threads
    if (
      digestData.last_session_recap.open_threads.length === 0 ||
      digestData.last_session_recap.open_threads.every((t) => !t.trim())
    ) {
      // Not critical, but good to have
    } else {
      filledSections++;
    }

    // Check next session plan
    const hasPlan =
      digestData.next_session_plan.objectives_dm.length > 0 ||
      digestData.next_session_plan.probable_player_goals.length > 0 ||
      digestData.next_session_plan.beats.length > 0 ||
      digestData.next_session_plan.if_then_branches.length > 0;
    if (!hasPlan) {
      issues.push("No next session planning information provided");
    } else {
      filledSections++;
    }

    // Check other sections (less critical)
    if (digestData.npcs_to_run.length > 0) filledSections++;
    if (digestData.locations_in_focus.length > 0) filledSections++;
    if (digestData.encounter_seeds.length > 0) filledSections++;
    if (digestData.clues_and_revelations.length > 0) filledSections++;
    if (digestData.treasure_and_rewards.length > 0) filledSections++;
    if (digestData.todo_checklist.length > 0) filledSections++;

    // Minimum required: key events + state changes + next session plan
    const hasMinimumRequired =
      digestData.last_session_recap.key_events.some((e) => e.trim()) &&
      hasStateChanges &&
      hasPlan;

    let score = 10;
    if (!hasMinimumRequired) {
      score = 3; // Fail if missing critical sections
    } else {
      // Score based on percentage of sections filled
      score = Math.max(3, (filledSections / totalSections) * 10);
    }

    return { score, issues };
  }

  /**
   * Check specificity - ensures entries are specific, not vague
   * Uses LLM to assess whether entries are concrete and actionable
   */
  private async checkSpecificity(digestData: SessionDigestData): Promise<{
    score: number;
    issues: string[];
  }> {
    // If no OpenAI key, return a default score
    if (!this.openaiApiKey) {
      return { score: 10, issues: [] };
    }

    try {
      const llmProvider = createLLMProvider({
        provider: "openai",
        apiKey: this.openaiApiKey,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.1,
        defaultMaxTokens: 2000,
      });

      const prompt = formatSpecificityAssessmentPrompt(digestData);

      const result = await llmProvider.generateStructuredOutput<{
        score: number;
        issues: string[];
      }>(prompt, {
        model: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 2000,
      });

      return {
        score: Math.max(0, Math.min(10, result.score)),
        issues: result.issues || [],
      };
    } catch (error) {
      console.warn(
        "[DigestQualityService] Failed to check specificity with AI:",
        error
      );
      // Return default score if AI check fails
      return { score: 10, issues: [] };
    }
  }

  /**
   * Check consistency - validates internal consistency using AI and GraphRAG
   * Extracts entity mentions from digest, queries GraphRAG for entity information,
   * and uses LLM to find inconsistencies
   */
  private async checkConsistency(
    digestData: SessionDigestData,
    campaignId?: string
  ): Promise<{
    score: number;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Basic duplicate check (still useful)
    const allEntries: string[] = [];
    digestData.last_session_recap.key_events.forEach((e) => {
      allEntries.push(e.toLowerCase().trim());
    });
    digestData.last_session_recap.open_threads.forEach((t) => {
      allEntries.push(t.toLowerCase().trim());
    });

    const seen = new Set<string>();
    allEntries.forEach((entry) => {
      if (entry && seen.has(entry)) {
        issues.push(`Duplicate entry detected: "${entry.substring(0, 50)}"`);
      }
      seen.add(entry);
    });

    // If we have AI and GraphRAG available, use them for advanced consistency checks
    if (
      this.openaiApiKey &&
      campaignId &&
      this.db &&
      this.vectorize &&
      this.env
    ) {
      try {
        const aiIssues = await this.checkConsistencyWithGraphRAG(
          digestData,
          campaignId
        );
        issues.push(...aiIssues);
      } catch (error) {
        console.warn(
          "[DigestQualityService] Failed to check consistency with GraphRAG:",
          error
        );
        // Continue with basic checks if GraphRAG check fails
      }
    }

    // Calculate score based on number of issues
    const maxIssues = 10;
    const issuePenalty = Math.min(issues.length, maxIssues) / maxIssues;
    const score = Math.max(0, 10 - issuePenalty * 10);

    return { score, issues: issues.slice(0, 15) }; // Limit issues to first 15
  }

  /**
   * Check consistency using AI and GraphRAG
   * Extracts entities from digest, queries GraphRAG, and finds inconsistencies
   */
  private async checkConsistencyWithGraphRAG(
    digestData: SessionDigestData,
    campaignId: string
  ): Promise<string[]> {
    if (!this.openaiApiKey || !this.db || !this.vectorize || !this.env) {
      return [];
    }

    // Step 1: Convert digest to text format and use EntityExtractionService
    const digestText = this.digestDataToText(digestData);

    const entityExtractionService = new EntityExtractionService(
      this.openaiApiKey || null
    );

    let extractedEntities: Array<{
      name: string;
      entityType: string;
    }> = [];

    try {
      const extracted = await entityExtractionService.extractEntities({
        content: digestText,
        sourceName: "Session Digest",
        campaignId,
        sourceId: `digest-consistency-check-${Date.now()}`,
        sourceType: "session_digest",
        openaiApiKey: this.openaiApiKey,
      });

      extractedEntities = extracted.map((entity) => ({
        name: entity.name,
        entityType: entity.entityType,
      }));
    } catch (error) {
      console.warn(
        "[DigestQualityService] Failed to extract entities using EntityExtractionService:",
        error
      );
      return [];
    }

    if (extractedEntities.length === 0) {
      return [];
    }

    // Step 2: Query GraphRAG for each entity to get their current state
    const planningContextService = new PlanningContextService(
      this.db,
      this.vectorize,
      this.openaiApiKey,
      this.env
    );
    const entityEmbeddingService = new EntityEmbeddingService(this.vectorize);
    const daoFactory = getDAOFactory(this.env);
    const entityGraphService = new EntityGraphService(daoFactory.entityDAO);

    const entityInfo: Array<{
      extractedEntity: { name: string; entityType: string };
      graphEntity: any | null;
      relationships: any[];
    }> = [];

    // Generate embeddings for entity search
    const entityQueries = extractedEntities.map((e) => e.name);
    let queryEmbeddings: number[][] = [];
    try {
      queryEmbeddings =
        await planningContextService.generateEmbeddings(entityQueries);
    } catch (error) {
      console.warn(
        "[DigestQualityService] Failed to generate embeddings:",
        error
      );
      return [];
    }

    // Search for each entity in GraphRAG
    for (let i = 0; i < extractedEntities.length; i++) {
      const extractedEntity = extractedEntities[i];
      const embedding = queryEmbeddings[i];

      try {
        // Find similar entities via semantic search
        const similarEntities =
          await entityEmbeddingService.findSimilarByEmbedding(embedding, {
            campaignId,
            topK: 5,
          });

        let matchedEntity = null;
        let relationships: any[] = [];

        // Find best matching entity (exact name match preferred)
        for (const similar of similarEntities) {
          if (similar.score >= 0.3) {
            const entity = await daoFactory.entityDAO.getEntityById(
              similar.entityId
            );
            if (
              entity &&
              entity.campaignId === campaignId &&
              entity.name.toLowerCase() === extractedEntity.name.toLowerCase()
            ) {
              matchedEntity = entity;
              relationships =
                await entityGraphService.getRelationshipsForEntity(
                  campaignId,
                  entity.id
                );
              break;
            }
          }
        }

        // If no exact match, use best semantic match
        if (!matchedEntity && similarEntities.length > 0) {
          const bestMatch = similarEntities[0];
          if (bestMatch.score >= 0.5) {
            const entity = await daoFactory.entityDAO.getEntityById(
              bestMatch.entityId
            );
            if (entity && entity.campaignId === campaignId) {
              matchedEntity = entity;
              relationships =
                await entityGraphService.getRelationshipsForEntity(
                  campaignId,
                  entity.id
                );
            }
          }
        }

        entityInfo.push({
          extractedEntity,
          graphEntity: matchedEntity,
          relationships,
        });
      } catch (error) {
        console.warn(
          `[DigestQualityService] Failed to query entity ${extractedEntity.name}:`,
          error
        );
        entityInfo.push({
          extractedEntity,
          graphEntity: null,
          relationships: [],
        });
      }
    }

    // Step 3: Use LLM to compare digest content with GraphRAG data and find inconsistencies
    const consistencyPrompt = formatConsistencyAssessmentPrompt(
      digestData,
      entityInfo.map((info) => ({
        extractedEntity: info.extractedEntity,
        graphEntity: info.graphEntity
          ? {
              id: info.graphEntity.id,
              name: info.graphEntity.name,
              entityType: info.graphEntity.entityType,
              content: info.graphEntity.content,
              relationships: info.relationships.map((r) => ({
                type: r.relationshipType,
                target: r.toEntityId,
              })),
            }
          : null,
      }))
    );

    const llmProvider = createLLMProvider({
      provider: "openai",
      apiKey: this.openaiApiKey,
      defaultModel: "gpt-4o-mini",
      defaultTemperature: 0.1,
      defaultMaxTokens: 1500,
    });

    try {
      const result = await llmProvider.generateStructuredOutput<{
        issues: string[];
      }>(consistencyPrompt, {
        model: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 1500,
      });

      return result.issues || [];
    } catch (error) {
      console.warn(
        "[DigestQualityService] Failed to check consistency with AI:",
        error
      );
      return [];
    }
  }

  /**
   * Check relevance - uses LLM to verify content relevance
   */
  private async checkRelevance(digestData: SessionDigestData): Promise<{
    score: number;
    issues: string[];
  }> {
    if (!this.openaiApiKey) {
      return { score: 10, issues: [] };
    }

    try {
      const llmProvider = createLLMProvider({
        provider: "openai",
        apiKey: this.openaiApiKey,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.1,
        defaultMaxTokens: 500,
      });

      const prompt = formatRelevanceAssessmentPrompt(digestData);

      const result = await llmProvider.generateStructuredOutput<{
        score: number;
        issues: string[];
      }>(prompt, {
        model: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 500,
      });

      return {
        score: Math.max(0, Math.min(10, result.score)),
        issues: result.issues || [],
      };
    } catch (error) {
      console.error("[DigestQualityService] Relevance check error:", error);
      return { score: 10, issues: [] }; // Default to no issues if check fails
    }
  }

  /**
   * Convert session digest data to text format for entity extraction
   */
  private digestDataToText(digestData: SessionDigestData): string {
    const sections: string[] = [];

    // Last Session Recap
    sections.push("LAST SESSION RECAP:");
    if (digestData.last_session_recap.key_events.length > 0) {
      sections.push("Key Events:");
      digestData.last_session_recap.key_events.forEach((event) => {
        sections.push(`- ${event}`);
      });
    }

    if (
      Object.values(digestData.last_session_recap.state_changes).some(
        (arr) => arr.length > 0
      )
    ) {
      sections.push("State Changes:");
      if (digestData.last_session_recap.state_changes.factions.length > 0) {
        sections.push("Factions:");
        digestData.last_session_recap.state_changes.factions.forEach((f) => {
          sections.push(`- ${f}`);
        });
      }
      if (digestData.last_session_recap.state_changes.locations.length > 0) {
        sections.push("Locations:");
        digestData.last_session_recap.state_changes.locations.forEach((l) => {
          sections.push(`- ${l}`);
        });
      }
      if (digestData.last_session_recap.state_changes.npcs.length > 0) {
        sections.push("NPCs:");
        digestData.last_session_recap.state_changes.npcs.forEach((npc) => {
          sections.push(`- ${npc}`);
        });
      }
    }

    if (digestData.last_session_recap.open_threads.length > 0) {
      sections.push("Open Threads:");
      digestData.last_session_recap.open_threads.forEach((thread) => {
        sections.push(`- ${thread}`);
      });
    }

    // Next Session Plan
    sections.push("\nNEXT SESSION PLAN:");
    if (digestData.next_session_plan.objectives_dm.length > 0) {
      sections.push("DM Objectives:");
      digestData.next_session_plan.objectives_dm.forEach((obj) => {
        sections.push(`- ${obj}`);
      });
    }
    if (digestData.next_session_plan.probable_player_goals.length > 0) {
      sections.push("Probable Player Goals:");
      digestData.next_session_plan.probable_player_goals.forEach((goal) => {
        sections.push(`- ${goal}`);
      });
    }
    if (digestData.next_session_plan.beats.length > 0) {
      sections.push("Beats:");
      digestData.next_session_plan.beats.forEach((beat) => {
        sections.push(`- ${beat}`);
      });
    }
    if (digestData.next_session_plan.if_then_branches.length > 0) {
      sections.push("If-Then Branches:");
      digestData.next_session_plan.if_then_branches.forEach((branch) => {
        sections.push(`- ${branch}`);
      });
    }

    // Additional sections
    if (digestData.npcs_to_run.length > 0) {
      sections.push("\nNPCs to Run:");
      digestData.npcs_to_run.forEach((npc) => {
        sections.push(`- ${npc}`);
      });
    }

    if (digestData.locations_in_focus.length > 0) {
      sections.push("Locations in Focus:");
      digestData.locations_in_focus.forEach((location) => {
        sections.push(`- ${location}`);
      });
    }

    if (digestData.encounter_seeds.length > 0) {
      sections.push("Encounter Seeds:");
      digestData.encounter_seeds.forEach((encounter) => {
        sections.push(`- ${encounter}`);
      });
    }

    if (digestData.clues_and_revelations.length > 0) {
      sections.push("Clues and Revelations:");
      digestData.clues_and_revelations.forEach((clue) => {
        sections.push(`- ${clue}`);
      });
    }

    if (digestData.treasure_and_rewards.length > 0) {
      sections.push("Treasure and Rewards:");
      digestData.treasure_and_rewards.forEach((treasure) => {
        sections.push(`- ${treasure}`);
      });
    }

    if (digestData.todo_checklist.length > 0) {
      sections.push("Todo Checklist:");
      digestData.todo_checklist.forEach((todo) => {
        sections.push(`- ${todo}`);
      });
    }

    return sections.join("\n");
  }
}
