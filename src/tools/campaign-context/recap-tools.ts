import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "../../app-constants";
import { getDAOFactory } from "../../dao/dao-factory";
import type { PlanningTaskStatus } from "../../dao/planning-task-dao";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { RecapService } from "../../services/core/recap-service";
import { searchCampaignContext } from "./search-tools";

const generateContextRecapSchema = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
  sinceTimestamp: z
    .string()
    .optional()
    .describe(
      "ISO timestamp string to get data since (defaults to 1 hour ago)"
    ),
});

/**
 * Single tool for campaign context recap. Uses RecapService (session digests,
 * world state changes, in-progress goals), builds the recap prompt with
 * next-steps preflight, and returns recapPrompt for the agent. Used both when
 * the user returns to the app (automatic recap) and when the agent needs
 * context recap (e.g. "give me a recap").
 */
export const generateContextRecapTool = tool({
  description:
    "Generate a context recap for a campaign summarizing recent activity, world state changes, session digests, and in-progress goals. Use this when a user returns to the app after being away, when they switch campaigns, or when they ask for a recap.",
  inputSchema: generateContextRecapSchema,
  execute: async (
    input: z.infer<typeof generateContextRecapSchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt, sinceTimestamp } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const env = getEnvFromContext(options);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const { getDAOFactory } = await import("../../dao/dao-factory");
      const daoFactory = getDAOFactory(env);
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

      const recapService = new RecapService(
        env as import("@/middleware/auth").Env
      );
      const recapData = await recapService.getContextRecap(
        campaignId,
        userId,
        sinceTimestamp
      );

      const { formatContextRecapPrompt } =
        await import("../../lib/prompts/recap-prompts");
      let recapPrompt = formatContextRecapPrompt(recapData);
      const { getPlanningTaskProgress } = await import("./planning-task-tools");
      const progressRes = (await (getPlanningTaskProgress.execute?.(
        {
          campaignId,
          jwt,
          includeStatuses: ["pending", "in_progress"],
        },
        {
          env,
          toolCallId: `${toolCallId}-preflight`,
        } as ToolExecuteOptions
      ) ?? Promise.resolve(null))) as
        | { result: { success: boolean; data?: unknown } }
        | null
        | undefined;
      const progressData =
        progressRes?.result?.success && progressRes?.result?.data
          ? (progressRes.result.data as {
              openTaskCount?: number;
              counts?: { completed?: number };
            })
          : null;
      const openTaskCount = progressData?.openTaskCount ?? 0;
      const completedCount = progressData?.counts?.completed ?? 0;
      if (openTaskCount > 0) {
        recapPrompt += `\n\n[Server preflight: This campaign already has ${openTaskCount} open next step(s). Call getPlanningTaskProgress to retrieve them, then present those to the user. Do NOT call recordPlanningTasks.]`;
      } else if (completedCount > 0) {
        recapPrompt += `\n\n[Server preflight: All next steps for this campaign are complete (${completedCount} completed). Your first response MUST be to ask: "Would you like me to construct a readout for your next session's plan? I'll stitch together your completion notes into a ready-to-run plan you can follow at the table—or is there something else you'd like to add first?" Do NOT suggest new next steps, World Expansion, Session Prep, or Player Engagement until the user answers. Do NOT call recordPlanningTasks.]`;
      } else {
        recapPrompt += `\n\n[Server preflight: There are no open next steps. You MUST generate 2-3 high-quality, campaign-relevant next steps (using the checklist and campaign context), then call recordPlanningTasks with them. Only after the tool succeeds may you say they have been saved and direct the user to Campaign Details > Next steps.]`;
      }

      return createToolSuccess(
        `Generated context recap for campaign "${campaign.name}"`,
        {
          campaignId,
          campaignName: campaign.name,
          recap: recapData,
          recapPrompt,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[generateContextRecapTool] Error:", error);
      return createToolError(
        "Failed to generate context recap",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});

const getSessionReadoutContextSchema = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
});

type SearchResultItem = { entityId?: string; text?: string; title?: string };

const ENTITY_CONTENT_MARKER =
  "ENTITY CONTENT (may contain unverified mentions):";

/**
 * Strip graph-RAG metadata (relationship headers, MEMBER_OF lines, etc.) from
 * entity text so the readout contains only narrative/content for the DM.
 */
function entityContentOnly(rawText: string): string {
  const idx = rawText.indexOf(ENTITY_CONTENT_MARKER);
  if (idx < 0) return rawText;
  const after = rawText.slice(idx + ENTITY_CONTENT_MARKER.length);
  return after.replace(/^[\s\n═-]+/, "").trim();
}

/**
 * Builds readout context per completed next step: for each task, finds relevant
 * entities (search by title + completion notes), pulls full graph context
 * (traversal from those entities), and returns one blob per step so the agent
 * can transform it into a session plan. Graph-structure headers are stripped
 * so the agent receives only entity content, not "EXPLICIT ENTITY RELATIONSHIPS".
 */
export const getSessionReadoutContext = tool({
  description:
    "Get full entity-graph context for each completed next step for building the session plan readout. Call when the user wants the readout (e.g. 'give me the readout', 'create the plan'). Returns one block per task with task info, readoutBlock (step title + entity content only; graph metadata is stripped), and entityResults. Transform this into a session plan for the DM: scene-based outline with Description, Helpful DM Info, Dialogue, mechanics. Do not expose graph structure; output should read as a usable session plan, not a graph walk.",
  inputSchema: getSessionReadoutContextSchema,
  execute: async (
    input: z.infer<typeof getSessionReadoutContextSchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      const env = getEnvFromContext(options);
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
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

      const planningTaskDAO = daoFactory.planningTaskDAO;
      const allTasks = await planningTaskDAO.listByCampaign(campaignId, {
        status: ["completed"] as PlanningTaskStatus[],
      });
      const completedTasks = [...allTasks].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      if (completedTasks.length === 0) {
        return createToolSuccess(
          "No completed next steps for this campaign; nothing to build readout from.",
          { steps: [] },
          toolCallId
        );
      }

      const steps: Array<{
        task: {
          id: string;
          title: string;
          completionNotes: string | null;
          createdAt: string;
        };
        instruction: string;
        readoutBlock: string;
        entityResults: Array<{ entityId: string; title: string; text: string }>;
      }> = [];

      const opts = {
        env,
        toolCallId: `${toolCallId}-step`,
      } as ToolExecuteOptions;

      for (const task of completedTasks) {
        const notesSlice = (task.completionNotes ?? "").slice(0, 400).trim();
        const queryFromTask = [task.title, notesSlice]
          .filter(Boolean)
          .join(" ")
          .trim();
        const searchQuery = queryFromTask || task.title;

        const searchArgs = {
          campaignId,
          jwt,
          searchOriginalFiles: false,
          includeTraversedEntities: true,
          offset: 0,
          limit: 50,
          forSessionReadout: true,
        };

        const searchRes = (await searchCampaignContext.execute?.(
          { ...searchArgs, query: searchQuery },
          opts
        )) as
          | {
              result: {
                success: boolean;
                data?: { results?: SearchResultItem[] };
              };
            }
          | undefined;

        const initialResults: SearchResultItem[] =
          searchRes?.result?.success && searchRes?.result?.data?.results
            ? searchRes.result.data.results
            : [];

        if (notesSlice && notesSlice.length > 80) {
          const notesOnlyRes = (await searchCampaignContext.execute?.(
            { ...searchArgs, query: notesSlice },
            opts
          )) as
            | {
                result: {
                  success: boolean;
                  data?: { results?: SearchResultItem[] };
                };
              }
            | undefined;
          const notesResults =
            notesOnlyRes?.result?.success && notesOnlyRes?.result?.data?.results
              ? notesOnlyRes.result.data.results
              : [];
          const seenIds = new Set(
            initialResults.map((r) => r.entityId).filter(Boolean)
          );
          for (const r of notesResults) {
            if (r.entityId && !seenIds.has(r.entityId)) {
              seenIds.add(r.entityId);
              initialResults.push(r);
            }
          }
        }

        const entityIds = initialResults
          .map((r) => r.entityId)
          .filter((id): id is string => Boolean(id));

        let traversedResults: SearchResultItem[] = [];
        if (entityIds.length > 0) {
          const traverseRes = (await searchCampaignContext.execute?.(
            {
              campaignId,
              jwt,
              query: task.title,
              searchOriginalFiles: false,
              traverseFromEntityIds: entityIds,
              traverseDepth: 2,
              includeTraversedEntities: true,
              offset: 0,
              limit: 50,
              forSessionReadout: true,
            },
            opts
          )) as
            | {
                result: {
                  success: boolean;
                  data?: { results?: SearchResultItem[] };
                };
              }
            | undefined;
          traversedResults =
            traverseRes?.result?.success && traverseRes?.result?.data?.results
              ? traverseRes.result.data.results
              : [];
        }

        const byId = new Map<string, { title: string; text: string }>();
        for (const r of initialResults) {
          if (r.entityId && r.text != null) {
            byId.set(r.entityId, {
              title: r.title ?? r.entityId,
              text: entityContentOnly(r.text),
            });
          }
        }
        for (const r of traversedResults) {
          if (r.entityId && r.text != null && !byId.has(r.entityId)) {
            byId.set(r.entityId, {
              title: r.title ?? r.entityId,
              text: entityContentOnly(r.text),
            });
          }
        }

        const entityResults = Array.from(byId.entries()).map(
          ([entityId, v]) => ({
            entityId,
            title: v.title,
            text: v.text,
          })
        );

        const readoutBlock = [
          `## ${task.title}`,
          "",
          ...entityResults.flatMap((e) => [`### ${e.title}`, "", e.text, ""]),
        ].join("\n");

        steps.push({
          task: {
            id: task.id,
            title: task.title,
            completionNotes: task.completionNotes,
            createdAt: task.createdAt,
          },
          instruction:
            "Transform the readoutBlock below into part of a session plan for the DM. Use the full entity content (Background, Character Traits, Emotional Stakes, NPC Reactions, mechanics, etc.) but present it as a scene or encounter in the plan: Description, Helpful DM Info, Dialogue, player options. Do not expose graph structure or relationship metadata. Output should read like a session script outline the DM can run at the table—not a raw dump of entity data. Include all substantive detail from the readoutBlock.",
          readoutBlock,
          entityResults,
        });
      }

      return createToolSuccess(
        `Readout context for ${steps.length} completed step(s). For each step, transform the readoutBlock into part of a session plan: scene-based outline with Description, Helpful DM Info, Dialogue, mechanics. Use the full entity detail but present it as a usable session plan for the DM—no graph structure or relationship metadata. Structure like a session script (e.g. numbered scenes, read-aloud optional, rollable tables if relevant). Do not omit substantive detail.`,
        { steps },
        toolCallId
      );
    } catch (error) {
      console.error("[getSessionReadoutContext] Error:", error);
      return createToolError(
        "Failed to get session readout context",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});
