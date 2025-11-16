import type { EntityDAO, Entity, EntityRelationship } from "@/dao/entity-dao";
import type {
  CommunitySummaryDAO,
  CommunitySummary,
  CreateCommunitySummaryInput,
} from "@/dao/community-summary-dao";
import type { Community } from "@/dao/community-dao";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { OpenAIAPIKeyError } from "@/lib/errors";

/**
 * Configuration constants for community summary generation
 */
const SUMMARY_CONFIG = {
  // LLM Configuration
  DEFAULT_MODEL: "gpt-4o-mini",
  DEFAULT_TEMPERATURE: 0.3,
  DEFAULT_MAX_TOKENS: 2000,
  LLM_PROVIDER: "openai" as const,

  // Content Limits
  MAX_ENTITIES_TO_SHOW: 50,
  MAX_RELATIONSHIPS_TO_SHOW: 50,
  MAX_CONTENT_LENGTH: 200,
  MAX_KEY_ENTITIES: 10,

  // Default Values
  DEFAULT_ENTITY_NAME: "Unnamed",
  DEFAULT_ENTITY_TYPE: "unknown",
  DEFAULT_CONTENT: "No content",

  // Community Level Context
  LEVEL_CONTEXTS: {
    0: "world-level",
    1: "region-level",
    2: "location-level",
    DEFAULT: "entity-level",
  } as const,

  // Error Messages
  ERRORS: {
    API_KEY_REQUIRED: "OpenAI API key is required for summary generation",
    GENERATION_FAILED: "Failed to generate summary",
    RETRIEVAL_FAILED: "Failed to retrieve created summary",
    UNKNOWN_ERROR: "Unknown error",
  },

  // Prompt Template
  PROMPT_TEMPLATE: {
    INTRODUCTION:
      "You are analyzing a {levelContext} community in a tabletop RPG campaign.",
    CONTEXT:
      "This community contains {entityCount} entities and {relationshipCount} relationships.",
    ENTITIES_HEADER: "ENTITIES:",
    RELATIONSHIPS_HEADER: "RELATIONSHIPS:",
    TRUNCATION_NOTICE: "(Showing first {limit} of {total})",
    TASK_HEADER: "TASK:",
    TASK_DESCRIPTION:
      "Generate a concise, informative summary (2-4 sentences) that captures:",
    TASK_ITEMS: [
      "The overall theme or focus of this community",
      "Key entities and their roles",
      "Important relationships and connections",
      "How entities interact within this community",
    ],
    TASK_FOOTER:
      "The summary should be useful for understanding the community's purpose and context in the campaign.",
    SUMMARY_HEADER: "SUMMARY:",
  },
} as const;

export interface CommunitySummaryOptions {
  openaiApiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  forceRegenerate?: boolean;
}

export interface CommunitySummaryResult {
  summary: CommunitySummary;
  keyEntities: string[];
}

export class CommunitySummaryService {
  constructor(
    private readonly entityDAO: EntityDAO,
    private readonly summaryDAO: CommunitySummaryDAO,
    private readonly defaultOpenAIKey?: string
  ) {}

  /**
   * Generate or retrieve summary for a community
   */
  async generateOrGetSummary(
    community: Community,
    options: CommunitySummaryOptions = {}
  ): Promise<CommunitySummaryResult> {
    // Check if summary already exists and shouldn't be regenerated
    if (!options.forceRegenerate) {
      const existing = await this.summaryDAO.getSummaryByCommunityId(
        community.id,
        community.campaignId
      );
      if (existing) {
        return {
          summary: existing,
          keyEntities: existing.keyEntities,
        };
      }
    }

    // Generate new summary
    return this.generateSummary(community, options);
  }

  /**
   * Generate summary for a community using LLM
   */
  async generateSummary(
    community: Community,
    options: CommunitySummaryOptions = {}
  ): Promise<CommunitySummaryResult> {
    const apiKey = options.openaiApiKey || this.defaultOpenAIKey || undefined;

    if (!apiKey) {
      throw new OpenAIAPIKeyError(SUMMARY_CONFIG.ERRORS.API_KEY_REQUIRED);
    }

    // Load entities and relationships for the community
    const { entities, relationships } = await this.loadCommunityData(community);

    // Build prompt based on community level
    const prompt = this.buildPrompt(community, entities, relationships);

    // Create LLM provider
    const llmProvider = createLLMProvider({
      provider: SUMMARY_CONFIG.LLM_PROVIDER,
      apiKey,
      defaultModel: options.model || SUMMARY_CONFIG.DEFAULT_MODEL,
      defaultTemperature:
        options.temperature ?? SUMMARY_CONFIG.DEFAULT_TEMPERATURE,
      defaultMaxTokens: options.maxTokens ?? SUMMARY_CONFIG.DEFAULT_MAX_TOKENS,
    });

    // Generate summary
    let summaryText: string;
    try {
      summaryText = await llmProvider.generateSummary(prompt, {
        model: options.model || SUMMARY_CONFIG.DEFAULT_MODEL,
        temperature: options.temperature ?? SUMMARY_CONFIG.DEFAULT_TEMPERATURE,
        maxTokens: options.maxTokens ?? SUMMARY_CONFIG.DEFAULT_MAX_TOKENS,
      });
    } catch (error) {
      console.error(
        `[CommunitySummaryService] Error generating summary for community ${community.id}:`,
        error
      );
      throw new Error(
        `${SUMMARY_CONFIG.ERRORS.GENERATION_FAILED}: ${error instanceof Error ? error.message : SUMMARY_CONFIG.ERRORS.UNKNOWN_ERROR}`
      );
    }

    // Extract key entities from summary
    const keyEntities = this.extractKeyEntities(summaryText, entities);

    // Store summary
    const summaryId = crypto.randomUUID();
    const summaryInput: CreateCommunitySummaryInput = {
      id: summaryId,
      communityId: community.id,
      level: community.level,
      summaryText,
      keyEntities,
      metadata: {
        entityCount: entities.length,
        relationshipCount: relationships.length,
        generatedWith: options.model || SUMMARY_CONFIG.DEFAULT_MODEL,
      },
    };

    await this.summaryDAO.createSummary(summaryInput);

    const createdSummary = await this.summaryDAO.getSummaryById(
      summaryId,
      community.campaignId
    );
    if (!createdSummary) {
      throw new Error(SUMMARY_CONFIG.ERRORS.RETRIEVAL_FAILED);
    }

    return {
      summary: createdSummary,
      keyEntities,
    };
  }

  /**
   * Load entities and relationships for a community
   */
  private async loadCommunityData(
    community: Community
  ): Promise<{ entities: Entity[]; relationships: EntityRelationship[] }> {
    const entities: Entity[] = [];
    const relationships: EntityRelationship[] = [];
    const entityIdSet = new Set<string>();

    // Load all entities in the community
    for (const entityId of community.entityIds) {
      const entity = await this.entityDAO.getEntityById(entityId);
      if (entity && entity.campaignId === community.campaignId) {
        entities.push(entity);
        entityIdSet.add(entityId);
      }
    }

    // Load relationships between entities in the community
    const seen = new Set<string>();
    for (const entityId of community.entityIds) {
      const entityRelationships =
        await this.entityDAO.getRelationshipsForEntity(entityId);
      for (const rel of entityRelationships) {
        // Only include relationships where both entities are in this community
        if (
          entityIdSet.has(rel.fromEntityId) &&
          entityIdSet.has(rel.toEntityId)
        ) {
          // Avoid duplicates (relationships are undirected for summarization)
          const key = `${rel.fromEntityId}-${rel.toEntityId}-${rel.relationshipType}`;
          const reverseKey = `${rel.toEntityId}-${rel.fromEntityId}-${rel.relationshipType}`;
          if (!seen.has(key) && !seen.has(reverseKey)) {
            seen.add(key);
            relationships.push(rel);
          }
        }
      }
    }

    return { entities, relationships };
  }

  /**
   * Build prompt for summary generation based on community level
   */
  private buildPrompt(
    community: Community,
    entities: Entity[],
    relationships: EntityRelationship[]
  ): string {
    const level = community.level;
    const entityCount = entities.length;
    const relationshipCount = relationships.length;

    // Build entity context
    const entityDescriptions = entities
      .slice(0, SUMMARY_CONFIG.MAX_ENTITIES_TO_SHOW)
      .map((entity) => {
        const name = entity.name || SUMMARY_CONFIG.DEFAULT_ENTITY_NAME;
        const type = entity.entityType || SUMMARY_CONFIG.DEFAULT_ENTITY_TYPE;
        const content =
          typeof entity.content === "string"
            ? entity.content.substring(0, SUMMARY_CONFIG.MAX_CONTENT_LENGTH)
            : typeof entity.content === "object"
              ? JSON.stringify(entity.content).substring(
                  0,
                  SUMMARY_CONFIG.MAX_CONTENT_LENGTH
                )
              : "";
        return `- ${name} (${type}): ${content || SUMMARY_CONFIG.DEFAULT_CONTENT}`;
      })
      .join("\n");

    // Build relationship context
    const relationshipDescriptions = relationships
      .slice(0, SUMMARY_CONFIG.MAX_RELATIONSHIPS_TO_SHOW)
      .map((rel) => {
        const fromEntity = entities.find((e) => e.id === rel.fromEntityId);
        const toEntity = entities.find((e) => e.id === rel.toEntityId);
        const fromName = fromEntity?.name || rel.fromEntityId;
        const toName = toEntity?.name || rel.toEntityId;
        const strength = rel.strength ? ` (strength: ${rel.strength})` : "";
        return `- ${fromName} --[${rel.relationshipType}]--> ${toName}${strength}`;
      })
      .join("\n");

    // Build level-specific prompt
    const levelContext =
      SUMMARY_CONFIG.LEVEL_CONTEXTS[
        level as keyof typeof SUMMARY_CONFIG.LEVEL_CONTEXTS
      ] || SUMMARY_CONFIG.LEVEL_CONTEXTS.DEFAULT;

    const promptParts = [
      SUMMARY_CONFIG.PROMPT_TEMPLATE.INTRODUCTION.replace(
        "{levelContext}",
        levelContext
      ),
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.CONTEXT.replace(
        "{entityCount}",
        entityCount.toString()
      ).replace("{relationshipCount}", relationshipCount.toString()),
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.ENTITIES_HEADER,
      entityDescriptions,
      entityCount > SUMMARY_CONFIG.MAX_ENTITIES_TO_SHOW
        ? `\n\n${SUMMARY_CONFIG.PROMPT_TEMPLATE.TRUNCATION_NOTICE.replace(
            "{limit}",
            SUMMARY_CONFIG.MAX_ENTITIES_TO_SHOW.toString()
          ).replace("{total}", entityCount.toString())} entities`
        : "",
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.RELATIONSHIPS_HEADER,
      relationshipDescriptions,
      relationshipCount > SUMMARY_CONFIG.MAX_RELATIONSHIPS_TO_SHOW
        ? `\n\n${SUMMARY_CONFIG.PROMPT_TEMPLATE.TRUNCATION_NOTICE.replace(
            "{limit}",
            SUMMARY_CONFIG.MAX_RELATIONSHIPS_TO_SHOW.toString()
          ).replace("{total}", relationshipCount.toString())} relationships`
        : "",
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.TASK_HEADER,
      SUMMARY_CONFIG.PROMPT_TEMPLATE.TASK_DESCRIPTION,
      ...SUMMARY_CONFIG.PROMPT_TEMPLATE.TASK_ITEMS.map(
        (item, index) => `${index + 1}. ${item}`
      ),
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.TASK_FOOTER,
      "",
      SUMMARY_CONFIG.PROMPT_TEMPLATE.SUMMARY_HEADER,
    ];

    return promptParts.join("\n");
  }

  /**
   * Extract key entity IDs mentioned in the summary
   */
  private extractKeyEntities(
    summaryText: string,
    entities: Entity[]
  ): string[] {
    const keyEntities: string[] = [];
    const summaryLower = summaryText.toLowerCase();

    // Find entities mentioned in the summary by name
    for (const entity of entities) {
      if (entity.name) {
        const nameLower = entity.name.toLowerCase();
        // Check if entity name appears in summary (simple substring match)
        if (summaryLower.includes(nameLower)) {
          keyEntities.push(entity.id);
        }
      }
    }

    // Limit to top N entities
    return keyEntities.slice(0, SUMMARY_CONFIG.MAX_KEY_ENTITIES);
  }

  /**
   * Update summary when community changes
   */
  async updateSummaryForCommunity(
    community: Community,
    options: CommunitySummaryOptions = {}
  ): Promise<CommunitySummaryResult> {
    // Delete existing summary
    await this.summaryDAO.deleteSummariesByCommunity(community.id);

    // Generate new summary
    return this.generateSummary(community, options);
  }

  /**
   * Batch generate summaries for multiple communities
   */
  async generateSummariesForCommunities(
    communities: Community[],
    options: CommunitySummaryOptions = {}
  ): Promise<CommunitySummaryResult[]> {
    const results: CommunitySummaryResult[] = [];

    // Generate summaries sequentially to avoid rate limits
    for (const community of communities) {
      try {
        const result = await this.generateOrGetSummary(community, options);
        results.push(result);
      } catch (error) {
        console.error(
          `[CommunitySummaryService] Failed to generate summary for community ${community.id}:`,
          error
        );
        // Continue with other communities even if one fails
      }
    }

    return results;
  }
}
