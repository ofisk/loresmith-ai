import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG } from "@/shared-config";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import type { ToolResult } from "@/app-constants";
import type { WorldStateChangelogPayload } from "@/types/world-state";

const entityUpdateSchema = z.object({
  entityId: z.string().describe("ID of the entity that changed."),
  status: z
    .string()
    .optional()
    .describe("New status or condition of the entity."),
  description: z
    .string()
    .optional()
    .describe("Narrative description of what changed for this entity."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Additional structured data about the change."),
});

const relationshipUpdateSchema = z.object({
  fromEntityId: z.string().describe("Source entity in the relationship."),
  toEntityId: z.string().describe("Target entity in the relationship."),
  newStatus: z
    .string()
    .optional()
    .describe("New state of the relationship (e.g., allied, hostile, broken)."),
  description: z
    .string()
    .optional()
    .describe("Narrative description of what changed between the entities."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Additional structured data about the relationship change."),
});

const newEntitySchema = z.object({
  entityId: z.string().describe("Stable identifier for the new entity."),
  name: z.string().optional().describe("Human-readable name for the entity."),
  type: z
    .string()
    .optional()
    .describe("Entity category (e.g., NPC, location, faction, artifact)."),
  status: z.string().optional().describe("Initial status of the entity."),
  description: z.string().optional().describe("Narrative description."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Additional structured data for the new entity."),
});

type EntityUpdateInput = z.infer<typeof entityUpdateSchema>;
type RelationshipUpdateInput = z.infer<typeof relationshipUpdateSchema>;
type NewEntityInput = z.infer<typeof newEntitySchema>;

function buildPayload(args: {
  campaignSessionId?: number | null;
  timestamp?: string;
  entityUpdates?: EntityUpdateInput[];
  relationshipUpdates?: RelationshipUpdateInput[];
  newEntities?: NewEntityInput[];
}): WorldStateChangelogPayload {
  const {
    campaignSessionId,
    timestamp,
    entityUpdates,
    relationshipUpdates,
    newEntities,
  } = args;

  return {
    campaign_session_id:
      typeof campaignSessionId === "number" || campaignSessionId === null
        ? campaignSessionId
        : null,
    timestamp: timestamp ?? new Date().toISOString(),
    entity_updates: (entityUpdates ?? []).map((update) => ({
      entity_id: update.entityId,
      status: update.status,
      description: update.description,
      metadata: update.metadata,
    })),
    relationship_updates: (relationshipUpdates ?? []).map((update) => ({
      from: update.fromEntityId,
      to: update.toEntityId,
      new_status: update.newStatus,
      description: update.description,
      metadata: update.metadata,
    })),
    new_entities: (newEntities ?? []).map((entity) => ({
      entity_id: entity.entityId,
      name: entity.name,
      type: entity.type,
      status: entity.status,
      description: entity.description,
      metadata: entity.metadata,
    })),
  };
}

async function submitWorldStateChange(
  campaignId: string,
  payload: WorldStateChangelogPayload,
  jwt: string | null | undefined,
  toolCallId: string,
  successMessage: string
): Promise<ToolResult> {
  try {
    const response = await authenticatedFetch(
      API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.CAMPAIGNS.WORLD_STATE.CHANGELOG(campaignId)
      ),
      {
        method: "POST",
        jwt,
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const authError = handleAuthError(response);
      if (authError) {
        return createToolError(authError, null, response.status, toolCallId);
      }
      let errorPayload: any = null;
      try {
        errorPayload = await response.json();
      } catch (_err) {
        // ignore
      }
      return createToolError(
        errorPayload?.error || "World state API error",
        errorPayload?.message || `HTTP ${response.status}`,
        response.status,
        toolCallId
      );
    }

    const data = (await response.json()) as { entry: unknown };
    return createToolSuccess(successMessage, data, toolCallId);
  } catch (error) {
    console.error("[WorldStateTool] Failed to submit changelog entry:", error);
    return createToolError(
      "Failed to update world state",
      error instanceof Error ? error.message : String(error),
      500,
      toolCallId
    );
  }
}

export const recordWorldEventTool = tool({
  description:
    "Record a world state changelog entry capturing multiple entity/relationship updates or new entities at once.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    campaignSessionId: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe(
        "Optional D&D game session number this change belongs to (e.g., Session 5)."
      ),
    timestamp: z
      .string()
      .optional()
      .describe(
        "ISO timestamp for when the change occurred. Defaults to the current time."
      ),
    entityUpdates: z
      .array(entityUpdateSchema)
      .optional()
      .describe("List of entity updates to record."),
    relationshipUpdates: z
      .array(relationshipUpdateSchema)
      .optional()
      .describe("List of relationship updates to record."),
    newEntities: z
      .array(newEntitySchema)
      .optional()
      .describe("List of new entities introduced into the world."),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      campaignSessionId,
      timestamp,
      entityUpdates,
      relationshipUpdates,
      newEntities,
      jwt,
    },
    context?: any
  ) => {
    const toolCallId = context?.toolCallId || crypto.randomUUID();
    const payload = buildPayload({
      campaignSessionId,
      timestamp,
      entityUpdates,
      relationshipUpdates,
      newEntities,
    });
    return submitWorldStateChange(
      campaignId,
      payload,
      jwt,
      toolCallId,
      "World state changelog entry recorded."
    );
  },
});

export const updateEntityWorldStateTool = tool({
  description:
    "Record a world state change for a single entity (e.g., location destroyed, NPC promoted).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    entityId: z
      .string()
      .describe("The entity whose world state is being updated."),
    status: z
      .string()
      .describe(
        "The new status/condition (e.g., destroyed, occupied, missing)."
      ),
    description: z
      .string()
      .optional()
      .describe("Narrative description of the change."),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional structured data about the change."),
    campaignSessionId: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe(
        "Optional D&D game session number for the change (e.g., Session 5)."
      ),
    timestamp: z
      .string()
      .optional()
      .describe("ISO timestamp for when the change occurred."),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      entityId,
      status,
      description,
      metadata,
      campaignSessionId,
      timestamp,
      jwt,
    },
    context?: any
  ) => {
    const toolCallId = context?.toolCallId || crypto.randomUUID();
    const payload = buildPayload({
      campaignSessionId,
      timestamp,
      entityUpdates: [
        {
          entityId,
          status,
          description,
          metadata,
        },
      ],
    });
    return submitWorldStateChange(
      campaignId,
      payload,
      jwt,
      toolCallId,
      `World state updated for entity ${entityId}.`
    );
  },
});

export const updateRelationshipWorldStateTool = tool({
  description:
    "Record a change in the relationship between two entities (e.g., allies became rivals).",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    fromEntityId: z
      .string()
      .describe(
        "Source entity in the relationship (e.g., initiating faction)."
      ),
    toEntityId: z
      .string()
      .describe("Target entity in the relationship (e.g., opposing faction)."),
    newStatus: z
      .string()
      .optional()
      .describe("New relationship status (e.g., allied, hostile, neutral)."),
    description: z
      .string()
      .optional()
      .describe("Narrative description of how the relationship changed."),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional structured data about the change."),
    campaignSessionId: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Optional D&D game session number (e.g., Session 5)."),
    timestamp: z
      .string()
      .optional()
      .describe("ISO timestamp for when the change occurred."),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      fromEntityId,
      toEntityId,
      newStatus,
      description,
      metadata,
      campaignSessionId,
      timestamp,
      jwt,
    },
    context?: any
  ) => {
    const toolCallId = context?.toolCallId || crypto.randomUUID();
    const payload = buildPayload({
      campaignSessionId,
      timestamp,
      relationshipUpdates: [
        {
          fromEntityId,
          toEntityId,
          newStatus,
          description,
          metadata,
        },
      ],
    });
    return submitWorldStateChange(
      campaignId,
      payload,
      jwt,
      toolCallId,
      `World state relationship updated for ${fromEntityId} -> ${toEntityId}.`
    );
  },
});
