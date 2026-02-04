import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import {
  ENTITY_TYPE_NPCS,
  ENTITY_TYPE_LOCATIONS,
  ENTITY_TYPE_PCS,
} from "@/lib/entity-type-constants";
import { analyzePlayerCharacterCompleteness } from "./planning-tools-utils";

const checkPlanningReadinessSchema = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
});

export const checkPlanningReadiness = tool({
  description:
    "Check if a campaign is ready for session planning by analyzing campaign state and identifying gaps. Returns readiness status and a list of gaps that should be filled before planning.",
  inputSchema: checkPlanningReadinessSchema,
  execute: async (
    input: z.infer<typeof checkPlanningReadinessSchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[checkPlanningReadiness] Using toolCallId:", toolCallId);

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

      const gaps: Array<{
        type: string;
        severity: "critical" | "important" | "minor";
        description: string;
        suggestion: string;
      }> = [];

      const [npcsCount, locationsCount, totalEntitiesCount] = await Promise.all(
        [
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
            entityType: ENTITY_TYPE_NPCS,
          }),
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
            entityType: ENTITY_TYPE_LOCATIONS,
          }),
          daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {}),
        ]
      );

      const digests =
        await daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(
          campaignId
        );
      if (digests.length === 0) {
        const hasEntities = totalEntitiesCount > 0;
        gaps.push({
          type: "session_digest",
          severity: "important",
          description: hasEntities
            ? "No session digests found. Recording session digests helps track what happened and provides context for planning future sessions."
            : "No session digests yet. This is normal for campaigns that haven't started. After your first session, creating a session digest will help track what happened and provide context for planning future sessions.",
          suggestion: hasEntities
            ? "Create a session digest for your previous sessions to provide context for planning the next session."
            : "After your first session, create a session digest to record what happened. This will help track the campaign's progress and provide context for planning future sessions.",
        });
      }

      if (npcsCount === 0) {
        gaps.push({
          type: "npcs",
          severity: "important",
          description: "No NPCs found in the campaign.",
          suggestion:
            "Add at least a few NPCs to provide characters for interactions and story development.",
        });
      }

      if (locationsCount === 0) {
        gaps.push({
          type: "locations",
          severity: "important",
          description: "No locations found in the campaign.",
          suggestion:
            "Add at least one location (starting location or current location) to provide a setting for the session.",
        });
      }

      const playerCharactersCount =
        await daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
          entityType: ENTITY_TYPE_PCS,
        });
      let playerCharacters: Awaited<
        ReturnType<typeof daoFactory.entityDAO.listEntitiesByCampaign>
      > = [];
      if (playerCharactersCount > 0) {
        playerCharacters = await daoFactory.entityDAO.listEntitiesByCampaign(
          campaignId,
          { entityType: ENTITY_TYPE_PCS }
        );
      }
      if (playerCharacters.length === 0) {
        gaps.push({
          type: "characters",
          severity: "minor",
          description: "No player characters found in the campaign.",
          suggestion:
            "Adding character backstories and goals as entities can help create more personalized session moments and connect characters to the campaign's entity graph.",
        });
      } else {
        const entityGraphService = new EntityGraphService(daoFactory.entityDAO);
        const importanceService = new EntityImportanceService(
          daoFactory.entityDAO,
          daoFactory.communityDAO,
          daoFactory.entityImportanceDAO
        );
        for (const character of playerCharacters) {
          const characterGaps = await analyzePlayerCharacterCompleteness(
            character,
            campaignId,
            entityGraphService,
            importanceService
          );
          gaps.push(...characterGaps);
        }
      }

      const criticalGaps = gaps.filter((g) => g.severity === "critical");
      const isReady = criticalGaps.length === 0;

      // Pull planning task progress for this campaign so agents can reference it
      const planningTasks =
        await daoFactory.planningTaskDAO.listByCampaign(campaignId);

      const planningTaskCounts = {
        pending: planningTasks.filter((t) => t.status === "pending").length,
        in_progress: planningTasks.filter((t) => t.status === "in_progress")
          .length,
        completed: planningTasks.filter((t) => t.status === "completed").length,
        superseded: planningTasks.filter((t) => t.status === "superseded")
          .length,
      } as const;

      const openPlanningTasksCount =
        planningTaskCounts.pending + planningTaskCounts.in_progress;

      let planningTasksAssessment: string;
      if (planningTasks.length === 0) {
        planningTasksAssessment =
          "No planning tasks have been recorded yet. It may help to ask for next steps or add your own planning tasks.";
      } else if (planningTaskCounts.completed >= 3) {
        planningTasksAssessment =
          "You have completed several planning tasks. You likely have a healthy amount of prep, but you can always refine further.";
      } else if (openPlanningTasksCount === 0) {
        planningTasksAssessment =
          "All recorded planning tasks are completed. You may be ready to run or to ask for new next-step suggestions.";
      } else {
        planningTasksAssessment =
          "There are still open planning tasks. Completing a few more items may improve your readiness for the next session.";
      }

      return createToolSuccess(
        isReady
          ? "Campaign is ready for session planning"
          : `Campaign has ${criticalGaps.length} critical gap(s) that should be addressed before planning`,
        {
          isReady,
          gaps,
          summary: {
            totalGaps: gaps.length,
            criticalGaps: criticalGaps.length,
            importantGaps: gaps.filter((g) => g.severity === "important")
              .length,
            minorGaps: gaps.filter((g) => g.severity === "minor").length,
          },
          campaignState: {
            sessionDigests: digests.length,
            npcs: npcsCount,
            locations: locationsCount,
            characters: playerCharactersCount,
            totalEntities: totalEntitiesCount,
          },
          planningTasks: {
            tasks: planningTasks,
            counts: planningTaskCounts,
            openTaskCount: openPlanningTasksCount,
            assessment: planningTasksAssessment,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error checking planning readiness:", error);
      return createToolError(
        "Failed to check planning readiness",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});
