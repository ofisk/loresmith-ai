import { type ActivityType, AssessmentDAO } from "@/dao/assessment-dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { getCampaignState } from "@/lib/campaign-state-utils";
import {
	CampaignReadinessAnalysisError,
	DataRetrievalError,
	UserStateAnalysisError,
} from "@/lib/errors";
import type { Env } from "@/middleware/auth";
import type { ModuleAnalysis } from "@/tools/campaign-context/assessment-core";
import type {
	ActionSuggestion,
	CampaignReadinessSummary,
	ToolRecommendation,
	UserState,
} from "@/types/assessment";
import type { Campaign, CampaignResource } from "@/types/campaign";

export type {
	ActivityType,
	UserState,
	CampaignReadinessSummary,
	ActionSuggestion,
	ToolRecommendation,
};

interface UserStateCacheEntry {
	data: UserState;
	expiresAt: number;
}

export class AssessmentService {
	private static userStateCache = new Map<string, UserStateCacheEntry>();
	private static readonly userStateCacheTTL = 5 * 60 * 1000; // 5 minutes

	/** Clear user state cache (for test isolation). */
	static clearUserStateCache(): void {
		AssessmentService.userStateCache.clear();
	}

	private assessmentDAO: AssessmentDAO;
	private env: Env;

	constructor(env: Env) {
		this.env = env;
		this.assessmentDAO = new AssessmentDAO(env.DB);
	}

	/**
	 * Analyze user's current state for contextual guidance.
	 * Results are cached per username with 5-minute TTL to reduce latency and DB load.
	 */
	async analyzeUserState(username: string): Promise<UserState> {
		try {
			const now = Date.now();
			const cached = AssessmentService.userStateCache.get(username);
			if (cached && cached.expiresAt > now) {
				return cached.data;
			}

			if (cached && cached.expiresAt <= now) {
				AssessmentService.userStateCache.delete(username);
			}

			// Get campaign and resource counts
			const campaignCount = await this.assessmentDAO.getCampaignCount(username);
			const resourceCount = await this.assessmentDAO.getResourceCount(username);

			// Get recent activity
			const recentActivity =
				await this.assessmentDAO.getRecentActivity(username);

			// Get last login (approximated by last activity)
			const lastLoginDate =
				(await this.assessmentDAO.getLastActivity(username)) ||
				new Date().toISOString();

			// Calculate total session time (approximated by activity count)
			const totalSessionTime = recentActivity.length * 30; // Rough estimate: 30 minutes per activity

			const userState: UserState = {
				isFirstTime: campaignCount === 0 && resourceCount === 0,
				hasCampaigns: campaignCount > 0,
				hasResources: resourceCount > 0,
				campaignCount,
				resourceCount,
				recentActivity,
				lastLoginDate,
				totalSessionTime,
			};

			AssessmentService.userStateCache.set(username, {
				data: userState,
				expiresAt: now + AssessmentService.userStateCacheTTL,
			});

			return userState;
		} catch (_error) {
			throw new UserStateAnalysisError();
		}
	}

	/**
	 * Get campaign readiness summary for existing campaigns
	 *
	 * Scoring Algorithm:
	 * - Context (0-50 pts): 0 items=10, 1-2 items=30, 3+=50
	 * - Characters (0-50 pts): 0 chars=10, 1-2 chars=30, 3+=50
	 * - Resources (0-40 pts): 0 resources=10, 1-4 resources=30, 5+=40
	 * Total capped at 100, then mapped to descriptive state via getCampaignState()
	 *
	 * Returns campaignState (descriptive), priorityAreas, and recommendations
	 */
	async getCampaignReadiness(
		campaignId: string,
		_campaign: Campaign,
		resources: CampaignResource[]
	): Promise<CampaignReadinessSummary> {
		try {
			// Sync character_backstory entries to entities before assessment
			// This ensures player characters are available in the entity graph
			try {
				const { CharacterEntitySyncService } = await import(
					"@/services/campaign/character-entity-sync-service"
				);
				const syncService = new CharacterEntitySyncService(this.env);
				await syncService.syncAllCharacterBackstories(campaignId);
			} catch (_syncError) {
				// Don't fail assessment if sync fails
			}

			// Get campaign data
			const daoFactory = getDAOFactory(this.env);
			const contextData = await this.assessmentDAO.getCampaignContext(
				campaignId,
				daoFactory.entityDAO
			);
			const charactersData = await this.assessmentDAO.getCampaignCharacters(
				campaignId,
				daoFactory.entityDAO
			);

			// Calculate readiness score based on data richness
			const contextCount = contextData.length;
			const characterCount = charactersData.length;
			const resourceCount = resources.length;

			// Simple scoring algorithm (can be enhanced with AI analysis)
			let overallScore = 0;
			const priorityAreas: string[] = [];
			const recommendations: string[] = [];

			// Score based on context richness
			if (contextCount === 0) {
				overallScore += 10;
				priorityAreas.push("Campaign Context");
				recommendations.push("Add world descriptions and campaign notes");
			} else if (contextCount < 3) {
				overallScore += 30;
				priorityAreas.push("Campaign Context");
				recommendations.push("Expand your campaign context with more details");
			} else {
				overallScore += 50;
			}

			// Score based on character development
			if (characterCount === 0) {
				overallScore += 10;
				priorityAreas.push("Character Development");
				recommendations.push("Create player characters and NPCs");
			} else if (characterCount < 3) {
				overallScore += 30;
				priorityAreas.push("Character Development");
				recommendations.push(
					"Develop more character backstories and relationships"
				);
			} else {
				overallScore += 50;
			}

			// Score based on resources
			if (resourceCount === 0) {
				overallScore += 10;
				priorityAreas.push("Resources");
				recommendations.push(
					"Upload campaign resources and inspiration materials"
				);
			} else if (resourceCount < 5) {
				overallScore += 30;
				priorityAreas.push("Resources");
				recommendations.push("Add more resources to enrich your campaign");
			} else {
				overallScore += 40;
			}

			// Normalize score to 0-100
			overallScore = Math.min(100, Math.max(0, overallScore));

			return {
				overallScore,
				campaignState: getCampaignState(overallScore),
				priorityAreas,
				recommendations,
			};
		} catch (_error) {
			throw new CampaignReadinessAnalysisError();
		}
	}

	/**
	 * Get user activity for personalized guidance
	 */
	async getUserActivity(username: string): Promise<ActivityType[]> {
		try {
			return await this.assessmentDAO.getUserActivity(username);
		} catch (_error) {
			throw new DataRetrievalError("Failed to retrieve user activity");
		}
	}

	/**
	 * Store extracted module information in campaign context
	 */
	async storeModuleAnalysis(
		campaignId: string,
		moduleAnalysis: ModuleAnalysis
	): Promise<boolean> {
		try {
			const { extractedElements, moduleName } = moduleAnalysis;

			// Store all extracted elements using the DAO with entityDAO
			const daoFactory = getDAOFactory(this.env);
			await this.assessmentDAO.storeNPCs(
				campaignId,
				extractedElements.npcs,
				moduleName,
				daoFactory.entityDAO
			);
			await this.assessmentDAO.storeLocations(
				campaignId,
				extractedElements.locations,
				moduleName,
				daoFactory.entityDAO
			);
			await this.assessmentDAO.storePlotHooks(
				campaignId,
				extractedElements.plotHooks,
				moduleName,
				daoFactory.entityDAO
			);
			await this.assessmentDAO.storeStoryBeats(
				campaignId,
				extractedElements.storyBeats,
				moduleName,
				daoFactory.entityDAO
			);
			await this.assessmentDAO.storeKeyItems(
				campaignId,
				extractedElements.keyItems,
				moduleName,
				daoFactory.entityDAO
			);
			await this.assessmentDAO.storeConflicts(
				campaignId,
				extractedElements.conflicts,
				moduleName,
				daoFactory.entityDAO
			);

			return true;
		} catch (_error) {
			return false;
		}
	}

	/**
	 * Get campaign context for assessment
	 */
	async getCampaignContext(campaignId: string): Promise<any[]> {
		try {
			const daoFactory = getDAOFactory(this.env);
			return await this.assessmentDAO.getCampaignContextOrdered(
				campaignId,
				daoFactory.entityDAO
			);
		} catch (_error) {
			throw new DataRetrievalError("Failed to retrieve campaign context");
		}
	}

	/**
	 * Get campaign characters for assessment
	 */
	async getCampaignCharacters(campaignId: string): Promise<any[]> {
		try {
			const daoFactory = getDAOFactory(this.env);
			return await this.assessmentDAO.getCampaignCharactersOrdered(
				campaignId,
				daoFactory.entityDAO
			);
		} catch (_error) {
			throw new DataRetrievalError("Failed to retrieve campaign characters");
		}
	}

	/**
	 * Get campaign resources for assessment
	 */
	async getCampaignResources(campaignId: string): Promise<any[]> {
		try {
			return await this.assessmentDAO.getCampaignResourcesOrdered(campaignId);
		} catch (_error) {
			throw new DataRetrievalError("Failed to retrieve campaign resources");
		}
	}
}
