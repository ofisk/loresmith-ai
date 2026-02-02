import type { D1Database } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  runWithEnvOrApi,
  type ToolExecuteOptions,
} from "../utils";
import type { ToolResult } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { getDAOFactory } from "@/dao/dao-factory";
import { CommunityDetectionService } from "@/services/graph/community-detection-service";
import { buildCommunityHierarchyTree } from "@/lib/graph/community-utils";

const detectCommunitiesSchema = z.object({
  campaignId: commonSchemas.campaignId,
  resolution: z
    .number()
    .optional()
    .describe(
      "Resolution parameter (0.5-2.0). Lower values find larger communities, higher values find smaller communities. Default: 1.0"
    ),
  minCommunitySize: z
    .number()
    .optional()
    .describe(
      "Minimum number of entities in a community. Communities smaller than this will be filtered out. Default: 2"
    ),
  maxLevels: z
    .number()
    .optional()
    .describe(
      "Maximum hierarchy levels for multi-level community detection. Set to 1 for flat communities, higher for hierarchical. Default: 1"
    ),
  jwt: commonSchemas.jwt,
});

export const detectCommunitiesTool = tool({
  description:
    "Detect communities (clusters) of related entities in a campaign using graph analysis. " +
    "This analyzes the entity relationship graph to find groups of entities that are highly connected. " +
    "Use this when the user wants to understand how entities cluster together or find related groups.",
  inputSchema: detectCommunitiesSchema,
  execute: async (
    input: z.infer<typeof detectCommunitiesSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, resolution, minCommunitySize, maxLevels, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    try {
      return await runWithEnvOrApi({
        context: options,
        jwt,
        authErrorResult: createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        ),
        apiCall: async () => {
          const response = await authenticatedFetch(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.DETECT(campaignId)
            ),
            {
              method: "POST",
              jwt,
              body: JSON.stringify({
                resolution,
                minCommunitySize,
                maxLevels,
              }),
            }
          );

          if (!response.ok) {
            const authError = handleAuthError(response);
            if (authError) {
              return createToolError(
                authError,
                "Authentication failed",
                response.status,
                toolCallId
              );
            }

            const errorData = (await response.json()) as {
              error?: string;
              message?: string;
            };
            return createToolError(
              errorData.error || "Failed to detect communities",
              errorData.message || "Unknown error",
              response.status,
              toolCallId
            );
          }

          const data = (await response.json()) as {
            count?: number;
            communities?: unknown[];
          };
          return createToolSuccess(
            `Detected ${data.count || 0} communities in campaign`,
            data,
            toolCallId
          );
        },
        dbCall: async (env, _userId) => {
          const daoFactory = getDAOFactory(env as { DB: D1Database });
          const campaign =
            await daoFactory.campaignDAO.getCampaignByIdWithMapping(
              campaignId,
              _userId
            );

          if (!campaign) {
            return createToolError(
              "Campaign not found",
              "Campaign not found or access denied",
              404,
              toolCallId
            );
          }

          const communityDetectionService = new CommunityDetectionService(
            daoFactory.entityDAO,
            daoFactory.communityDAO,
            daoFactory.communitySummaryDAO,
            (env as { OPENAI_API_KEY?: string })?.OPENAI_API_KEY
          );

          const useMultiLevel = maxLevels && maxLevels > 1;
          let communities: unknown[];

          if (useMultiLevel) {
            const hierarchies =
              await communityDetectionService.detectMultiLevelCommunities(
                campaignId,
                {
                  resolution,
                  minCommunitySize,
                  maxLevels,
                }
              );
            const allCommunities: unknown[] = [];
            function collectCommunities(hierarchy: {
              community: unknown;
              children: unknown[];
            }) {
              allCommunities.push(hierarchy.community);
              for (const child of hierarchy.children) {
                collectCommunities(
                  child as { community: unknown; children: unknown[] }
                );
              }
            }
            for (const hierarchy of hierarchies) {
              collectCommunities(hierarchy);
            }
            communities = allCommunities;
          } else {
            communities = await communityDetectionService.detectCommunities(
              campaignId,
              {
                resolution,
                minCommunitySize,
              }
            );
          }

          return createToolSuccess(
            `Detected ${communities.length} communities in campaign`,
            {
              communities,
              count: communities.length,
            },
            toolCallId
          );
        },
      });
    } catch (error) {
      console.error("[detectCommunitiesTool] Error:", error);
      return createToolError(
        "Failed to detect communities",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

const getCommunitiesSchema = z.object({
  campaignId: commonSchemas.campaignId,
  level: z
    .number()
    .optional()
    .describe(
      "Filter communities by hierarchy level. 0 = top level. Omit to get all levels."
    ),
  jwt: commonSchemas.jwt,
});

export const getCommunitiesTool = tool({
  description:
    "Get the list of communities (entity clusters) for a campaign. " +
    "Returns communities that were previously detected. Use this to show users what communities exist.",
  inputSchema: getCommunitiesSchema,
  execute: async (
    input: z.infer<typeof getCommunitiesSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, level, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    try {
      const env = getEnvFromContext(options);
      if (!env) {
        // Fallback to API call
        const url = new URL(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.LIST(campaignId)
          )
        );
        if (level !== undefined) {
          url.searchParams.set("level", level.toString());
        }

        const response = await authenticatedFetch(url.toString(), {
          method: "GET",
          jwt,
        });

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              "Authentication failed",
              response.status,
              toolCallId
            );
          }

          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          return createToolError(
            errorData.error || "Failed to get communities",
            errorData.message || "Unknown error",
            response.status,
            toolCallId
          );
        }

        const data = (await response.json()) as {
          count?: number;
          communities?: unknown[];
        };
        return createToolSuccess(
          `Found ${data.count || 0} communities`,
          data,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory
      const daoFactory = getDAOFactory(env as { DB: D1Database });

      // Verify campaign ownership using DAO
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      const communities =
        await daoFactory.communityDAO.listCommunitiesByCampaign(
          campaignId,
          level !== undefined ? { level } : {}
        );

      return createToolSuccess(
        `Found ${communities.length} communities`,
        {
          communities,
          count: communities.length,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[getCommunitiesTool] Error:", error);
      return createToolError(
        "Failed to get communities",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

const getCommunityHierarchySchema = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
});

export const getCommunityHierarchyTool = tool({
  description:
    "Get the hierarchical structure of communities for a campaign. " +
    "Returns communities organized in a tree structure showing parent-child relationships. " +
    "Use this when the user wants to see how communities are organized hierarchically.",
  inputSchema: getCommunityHierarchySchema,
  execute: async (
    input: z.infer<typeof getCommunityHierarchySchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    try {
      const env = getEnvFromContext(options);
      if (!env) {
        // Fallback to API call
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.COMMUNITIES.HIERARCHY(campaignId)
          ),
          {
            method: "GET",
            jwt,
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              "Authentication failed",
              response.status,
              toolCallId
            );
          }

          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          return createToolError(
            errorData.error || "Failed to get community hierarchy",
            errorData.message || "Unknown error",
            response.status,
            toolCallId
          );
        }

        const data = await response.json();
        return createToolSuccess(
          "Retrieved community hierarchy",
          data,
          toolCallId
        );
      }

      // Direct database access
      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      // Get DAO factory and utilities
      const daoFactory = getDAOFactory(env as { DB: D1Database });

      // Verify campaign ownership using DAO
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }
      const communities =
        await daoFactory.communityDAO.listCommunitiesByCampaign(campaignId);

      const hierarchy = buildCommunityHierarchyTree(communities);

      return createToolSuccess(
        "Retrieved community hierarchy",
        {
          hierarchy,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[getCommunityHierarchyTool] Error:", error);
      return createToolError(
        "Failed to get community hierarchy",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});
