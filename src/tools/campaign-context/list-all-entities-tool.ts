import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { getDAOFactory } from "../../dao/dao-factory";
import { STRUCTURED_ENTITY_TYPES } from "../../lib/entity-types";
import { isEntityStub } from "@/lib/entity-content-merge";

const ENTITY_TYPES_LIST = STRUCTURED_ENTITY_TYPES.join(", ");
const LIST_ALL_ENTITIES_PAGE_SIZE = 100;

const listAllEntitiesSchema = z.object({
  campaignId: commonSchemas.campaignId,
  entityType: z
    .preprocess(
      (val) => (val === "" ? undefined : val),
      z
        .enum([...STRUCTURED_ENTITY_TYPES, "character", "resource"] as [
          string,
          ...string[],
        ])
        .optional()
    )
    .describe(
      `Optional entity type to filter by. Available types: ${ENTITY_TYPES_LIST}. If not provided or empty string, returns all entity types.`
    ),
  includeStubs: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, include stub entities (minimal/incomplete). Use when the agent needs to surface incomplete entities and prompt the user to fill in gaps. Default false: stubs are excluded from list results."
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe(
      "Page number (1-based). Use 1 for first page; if totalPages > 1, call again with page=2, 3, ... to get all entities."
    ),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(LIST_ALL_ENTITIES_PAGE_SIZE)
    .describe(
      "Number of entities per page. Default 100. Keep default to avoid context overflow; request next page with page parameter."
    ),
  jwt: commonSchemas.jwt,
});

export const listAllEntities = tool({
  description: `List entities from a campaign ONE PAGE AT A TIME. Returns a single page of results; totalCount and totalPages tell you if more pages exist.

IMPORTANT: If totalPages > 1, you MUST call listAllEntities again with page set to 2, 3, ... until you have all pages (or enough to answer the user). Make multiple tool calls in sequence—do not assume one call returns everything when totalCount is large.

Use for "list all" or counting by type. For a specific search (e.g. "entries for the abbott"), use searchCampaignContext instead.

Entity types: ${ENTITY_TYPES_LIST}. Map synonyms: "beasts"/"creatures" → "monsters", "people"/"characters" (NPCs) → "npcs", "player characters"/"PCs" → "pcs", "places" → "locations".

Distinguish "npcs" (GM-controlled) from "pcs" (player-controlled). For "characters", determine context.`,
  inputSchema: listAllEntitiesSchema,
  execute: async (
    input: z.infer<typeof listAllEntitiesSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, entityType, includeStubs, page, pageSize, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[listAllEntities] Using toolCallId:", toolCallId);

    try {
      const env = getEnvFromContext(options);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Unable to access campaign data",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaignDAO = daoFactory.campaignDAO;
      const campaign = await campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found",
          404,
          toolCallId
        );
      }

      const entityTypeMap: Record<string, string> = {
        characters: "character",
        resources: "resource",
      };
      const targetEntityType =
        entityType && entityType.trim() !== ""
          ? entityTypeMap[entityType] || entityType
          : null;

      const totalCount = await daoFactory.entityDAO.getEntityCountByCampaign(
        campaignId,
        targetEntityType ? { entityType: targetEntityType } : {}
      );

      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const offset = (page - 1) * pageSize;

      console.log(
        `[Tool] listAllEntities - Page ${page}/${totalPages}, offset ${offset}, pageSize ${pageSize} (${totalCount} total)${targetEntityType ? ` of type ${targetEntityType}` : ""}`
      );

      const pageEntities = await daoFactory.entityDAO.listEntitiesByCampaign(
        campaignId,
        {
          entityType: targetEntityType || undefined,
          limit: pageSize,
          offset,
          orderBy: "name",
        }
      );

      const entitiesToReturn = includeStubs
        ? pageEntities
        : pageEntities.filter((e) => !isEntityStub(e));

      const results = entitiesToReturn.map((entity) => {
        const text =
          typeof entity.content === "string"
            ? entity.content
            : JSON.stringify(entity.content ?? "");
        return {
          id: entity.id,
          type: entity.entityType,
          name: entity.name || entity.id,
          title: entity.name,
          display_name: entity.name,
          text,
          metadata: entity.metadata,
          relationships: [],
          score: 1.0,
        };
      });

      const nameCounts = new Map<
        string,
        { count: number; entityIds: string[] }
      >();
      for (const entity of results) {
        const normalizedName = (
          entity.name ||
          entity.title ||
          entity.display_name ||
          ""
        )
          .toLowerCase()
          .trim();
        if (normalizedName) {
          const existing = nameCounts.get(normalizedName) || {
            count: 0,
            entityIds: [],
          };
          existing.count++;
          existing.entityIds.push(entity.id);
          nameCounts.set(normalizedName, existing);
        }
      }
      const duplicates: Array<{
        name: string;
        count: number;
        entityIds: string[];
      }> = [];
      for (const [name, data] of nameCounts.entries()) {
        if (data.count > 1) {
          duplicates.push({
            name,
            count: data.count,
            entityIds: data.entityIds,
          });
        }
      }

      const hasMore = page < totalPages;
      const entityTypeLabel = entityType ? ` (${entityType})` : "";
      let message = `Page ${page} of ${totalPages}: ${results.length} entities${entityTypeLabel} (${totalCount} total, sorted by name).`;
      if (hasMore) {
        message += ` There are more pages. You MUST call listAllEntities again with page=${page + 1} (and same campaignId, entityType) to get the next page until you have all data or can answer the user.`;
      }
      if (duplicates.length > 0) {
        const duplicateNames = duplicates
          .map((d) => `"${d.name}" (${d.count} on this page)`)
          .join(", ");
        message += ` Duplicates on this page: ${duplicateNames}.`;
      }

      return createToolSuccess(
        message,
        {
          entityType: entityType || null,
          results,
          totalCount,
          page,
          pageSize,
          totalPages,
          hasMore,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error listing all entities:", error);
      return createToolError(
        "Failed to list all entities",
        error,
        500,
        toolCallId
      );
    }
  },
});
