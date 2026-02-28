import type {
	D1Database,
	D1PreparedStatement,
	D1Result,
} from "@cloudflare/workers-types";
import { DAOFactoryError } from "@/lib/errors";
import { CommunitySummaryService } from "@/services/graph/community-summary-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import { RebuildTriggerService } from "@/services/graph/rebuild-trigger-service";
import { AuthUserDAO } from "./auth-user-dao";
import { CampaignDAO } from "./campaign-dao";
import { CampaignResourceProposalDAO } from "./campaign-resource-proposal-dao";
import { CampaignShareLinkDAO } from "./campaign-share-link-dao";
import { CharacterSheetDAO } from "./character-sheet-dao";
import { ChecklistStatusDAO } from "./checklist-status-dao";
import { CommunityDAO } from "./community-dao";
import { CommunitySummaryDAO } from "./community-summary-dao";
import { EntityDAO } from "./entity-dao";
import { EntityImportanceDAO } from "./entity-importance-dao";
import { FileDAO } from "./file/file-dao";
import { GraphRebuildDirtyDAO } from "./graph-rebuild-dirty-dao";
import { LLMUsageDAO } from "./llm-usage-dao";
import { MessageHistoryDAO } from "./message-history-dao";
import { PlanningTaskDAO } from "./planning-task-dao";
import { PlayerCharacterClaimDAO } from "./player-character-claim-dao";
import { RebuildStatusDAO } from "./rebuild-status-dao";
import { SessionDigestDAO } from "./session-digest-dao";
import { SessionDigestTemplateDAO } from "./session-digest-template-dao";
import { ShardDAO } from "./shard-dao";
import type { UserStorageUsage } from "./user-dao";
import { UserDAO } from "./user-dao";

// Cache for DAO factory instances
const daoFactoryCache = new WeakMap<D1Database, DAOFactory>();

export interface DAOFactory {
	authUserDAO: AuthUserDAO;
	userDAO: UserDAO;
	campaignDAO: CampaignDAO;
	fileDAO: FileDAO;
	shardDAO: ShardDAO;
	entityDAO: EntityDAO;
	graphRebuildDirtyDAO: GraphRebuildDirtyDAO;
	llmUsageDAO: LLMUsageDAO;
	communityDAO: CommunityDAO;
	communitySummaryDAO: CommunitySummaryDAO;
	entityImportanceDAO: EntityImportanceDAO;
	sessionDigestDAO: SessionDigestDAO;
	sessionDigestTemplateDAO: SessionDigestTemplateDAO;
	rebuildStatusDAO: RebuildStatusDAO;
	messageHistoryDAO: MessageHistoryDAO;
	checklistStatusDAO: ChecklistStatusDAO;
	characterSheetDAO: CharacterSheetDAO;
	planningTaskDAO: PlanningTaskDAO;
	playerCharacterClaimDAO: PlayerCharacterClaimDAO;
	campaignShareLinkDAO: CampaignShareLinkDAO;
	campaignResourceProposalDAO: CampaignResourceProposalDAO;
	entityGraphService: EntityGraphService;
	entityImportanceService: EntityImportanceService;
	rebuildTriggerService: RebuildTriggerService;
	communitySummaryService: CommunitySummaryService;

	getStorageUsage(username: string): Promise<UserStorageUsage>;
	parallel<T>(operations: (() => Promise<T>)[]): Promise<T[]>;
	batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export class DAOFactoryImpl implements DAOFactory {
	private readonly db: D1Database;
	public readonly authUserDAO: AuthUserDAO;
	public readonly userDAO: UserDAO;
	public readonly campaignDAO: CampaignDAO;
	public readonly fileDAO: FileDAO;
	public readonly shardDAO: ShardDAO;
	public readonly entityDAO: EntityDAO;
	public readonly graphRebuildDirtyDAO: GraphRebuildDirtyDAO;
	public readonly llmUsageDAO: LLMUsageDAO;
	public readonly communityDAO: CommunityDAO;
	public readonly communitySummaryDAO: CommunitySummaryDAO;
	public readonly entityImportanceDAO: EntityImportanceDAO;
	public readonly sessionDigestDAO: SessionDigestDAO;
	public readonly sessionDigestTemplateDAO: SessionDigestTemplateDAO;
	public readonly rebuildStatusDAO: RebuildStatusDAO;
	public readonly messageHistoryDAO: MessageHistoryDAO;
	public readonly checklistStatusDAO: ChecklistStatusDAO;
	public readonly characterSheetDAO: CharacterSheetDAO;
	public readonly planningTaskDAO: PlanningTaskDAO;
	public readonly playerCharacterClaimDAO: PlayerCharacterClaimDAO;
	public readonly campaignShareLinkDAO: CampaignShareLinkDAO;
	public readonly campaignResourceProposalDAO: CampaignResourceProposalDAO;
	private _entityGraphService: EntityGraphService | null = null;
	private _entityImportanceService: EntityImportanceService | null = null;
	private _rebuildTriggerService: RebuildTriggerService | null = null;
	private _communitySummaryService: CommunitySummaryService | null = null;

	constructor(db: D1Database) {
		this.db = db;
		this.authUserDAO = new AuthUserDAO(db);
		this.userDAO = new UserDAO(db);
		this.campaignDAO = new CampaignDAO(db);
		this.fileDAO = new FileDAO(db);
		this.shardDAO = new ShardDAO(db);
		this.entityDAO = new EntityDAO(db);
		this.graphRebuildDirtyDAO = new GraphRebuildDirtyDAO(db);
		this.llmUsageDAO = new LLMUsageDAO(db);
		this.communityDAO = new CommunityDAO(db);
		this.communitySummaryDAO = new CommunitySummaryDAO(db);
		this.entityImportanceDAO = new EntityImportanceDAO(db);
		this.sessionDigestDAO = new SessionDigestDAO(db);
		this.sessionDigestTemplateDAO = new SessionDigestTemplateDAO(db);
		this.rebuildStatusDAO = new RebuildStatusDAO(db);
		this.messageHistoryDAO = new MessageHistoryDAO(db);
		this.checklistStatusDAO = new ChecklistStatusDAO(db);
		this.characterSheetDAO = new CharacterSheetDAO(db);
		this.planningTaskDAO = new PlanningTaskDAO(db);
		this.playerCharacterClaimDAO = new PlayerCharacterClaimDAO(db);
		this.campaignShareLinkDAO = new CampaignShareLinkDAO(db);
		this.campaignResourceProposalDAO = new CampaignResourceProposalDAO(db);
	}

	async getStorageUsage(username: string): Promise<UserStorageUsage> {
		return this.userDAO.getStorageUsage(username);
	}

	get entityGraphService(): EntityGraphService {
		if (!this._entityGraphService) {
			this._entityGraphService = new EntityGraphService(this.entityDAO);
		}
		return this._entityGraphService;
	}

	get entityImportanceService(): EntityImportanceService {
		if (!this._entityImportanceService) {
			this._entityImportanceService = new EntityImportanceService(
				this.entityDAO,
				this.communityDAO,
				this.entityImportanceDAO
			);
		}
		return this._entityImportanceService;
	}

	get rebuildTriggerService(): RebuildTriggerService {
		if (!this._rebuildTriggerService) {
			this._rebuildTriggerService = new RebuildTriggerService(
				this.campaignDAO,
				this.entityDAO,
				this.rebuildStatusDAO,
				this.graphRebuildDirtyDAO
			);
		}
		return this._rebuildTriggerService;
	}

	get communitySummaryService(): CommunitySummaryService {
		if (!this._communitySummaryService) {
			this._communitySummaryService = new CommunitySummaryService(
				this.entityDAO,
				this.communitySummaryDAO
			);
		}
		return this._communitySummaryService;
	}

	getDAO<
		T extends keyof Omit<
			DAOFactory,
			| "getStorageUsage"
			| "parallel"
			| "batch"
			| "entityGraphService"
			| "entityImportanceService"
			| "rebuildTriggerService"
			| "communitySummaryService"
		>,
	>(name: T): DAOFactory[T] {
		return this[name];
	}

	async parallel<T>(operations: (() => Promise<T>)[]): Promise<T[]> {
		try {
			return await Promise.all(operations.map((op) => op()));
		} catch (error) {
			console.error("DAO parallel error:", error);
			throw error;
		}
	}

	async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
		return await this.db.batch(statements);
	}
}

export function createDAOFactory(db: D1Database | undefined): DAOFactory {
	if (!db) {
		throw new DAOFactoryError();
	}

	const factory = new DAOFactoryImpl(db);
	daoFactoryCache.set(db, factory);
	return factory;
}

export function getDAOFactory(env: unknown): DAOFactory {
	const e = env as { DB?: D1Database };
	const db = e?.DB;
	if (!db) {
		throw new DAOFactoryError();
	}

	const existingFactory = daoFactoryCache.get(db);
	if (existingFactory) {
		return existingFactory;
	}

	return createDAOFactory(db);
}
