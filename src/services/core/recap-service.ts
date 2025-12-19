import { AssessmentDAO } from "@/dao/assessment-dao";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import { getDAOFactory } from "@/dao/dao-factory";
import type { ActivityType } from "@/dao/assessment-dao";
import type { WorldStateChangelogEntry } from "@/types/world-state";
import type { SessionDigestWithData } from "@/types/session-digest";
import type { Env } from "@/middleware/auth";

export interface ContextRecapData {
  recentActivity: ActivityType[];
  worldStateChanges: WorldStateChangelogEntry[];
  recentSessionDigests: SessionDigestWithData[];
  inProgressGoals: {
    todoChecklist: string[];
    openThreads: string[];
  };
}

/**
 * Service for gathering context recap data when users return to the app
 */
export class RecapService {
  private assessmentDAO: AssessmentDAO;
  private worldStateChangelogDAO: WorldStateChangelogDAO;
  private daoFactory: ReturnType<typeof getDAOFactory>;

  constructor(env: Env) {
    this.assessmentDAO = new AssessmentDAO(env.DB);
    this.worldStateChangelogDAO = new WorldStateChangelogDAO(env.DB);
    this.daoFactory = getDAOFactory(env);
  }

  /**
   * Get context recap data for a campaign since a specific timestamp
   * @param campaignId - The campaign ID to get recap data for
   * @param username - The username (for filtering activity)
   * @param sinceTimestamp - ISO timestamp string to get data since (defaults to 1 hour ago)
   * @returns Structured recap data object
   */
  async getContextRecap(
    campaignId: string,
    username: string,
    sinceTimestamp?: string
  ): Promise<ContextRecapData> {
    // Default to 1 hour ago if not specified
    const since =
      sinceTimestamp || new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Get recent activity for the user (filtered to since timestamp)
    const allRecentActivity =
      await this.assessmentDAO.getRecentActivity(username);
    const recentActivity = allRecentActivity.filter(
      (activity) => new Date(activity.timestamp) >= new Date(since)
    );

    // Get world state changes since timestamp
    const worldStateChanges =
      await this.worldStateChangelogDAO.listEntriesForCampaign(campaignId, {
        fromTimestamp: since,
        limit: 50, // Limit to most recent 50 changes
      });

    // Get recent session digests (last 5)
    const recentSessionDigests =
      await this.daoFactory.sessionDigestDAO.getRecentSessionDigests(
        campaignId,
        5
      );

    // Extract in-progress goals from most recent session digest
    let inProgressGoals = {
      todoChecklist: [] as string[],
      openThreads: [] as string[],
    };

    if (recentSessionDigests.length > 0) {
      const mostRecentDigest = recentSessionDigests[0];
      inProgressGoals = {
        todoChecklist: mostRecentDigest.digestData.todo_checklist || [],
        openThreads:
          mostRecentDigest.digestData.last_session_recap?.open_threads || [],
      };
    }

    return {
      recentActivity,
      worldStateChanges,
      recentSessionDigests,
      inProgressGoals,
    };
  }
}
