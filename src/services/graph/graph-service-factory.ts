import { MODEL_CONFIG } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import { getEnvVar } from "@/lib/env-utils";
import type { Env } from "@/middleware/auth";
import { RebuildPipelineService } from "./rebuild-pipeline-service";
import { RebuildQueueService } from "./rebuild-queue-service";
import { WorldStateChangelogService } from "./world-state-changelog-service";

function normalizeApiKey(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function getGraphServices(env: Env): {
	rebuildQueue: RebuildQueueService;
	worldStateChangelog: WorldStateChangelogService;
} {
	if (!env.GRAPH_REBUILD_QUEUE) {
		throw new Error("GRAPH_REBUILD_QUEUE binding not configured");
	}
	if (!env.DB) {
		throw new Error("Database not configured");
	}

	return {
		rebuildQueue: new RebuildQueueService(env.GRAPH_REBUILD_QUEUE),
		worldStateChangelog: new WorldStateChangelogService({ db: env.DB }),
	};
}

export async function getRebuildPipelineService(
	env: Env
): Promise<RebuildPipelineService> {
	if (!env.DB) {
		throw new Error("Database not configured");
	}

	const daoFactory = getDAOFactory(env);
	const providerKeyEnvVar =
		MODEL_CONFIG.PROVIDER.DEFAULT === "anthropic"
			? "ANTHROPIC_API_KEY"
			: "OPENAI_API_KEY";
	const providerApiKeyRaw = await getEnvVar(env, providerKeyEnvVar, false);
	const providerApiKey = normalizeApiKey(providerApiKeyRaw);
	const worldStateChangelogDAO = new WorldStateChangelogDAO(env.DB);

	return new RebuildPipelineService(
		env.DB,
		daoFactory.rebuildStatusDAO,
		daoFactory.entityDAO,
		daoFactory.communityDAO,
		daoFactory.communitySummaryDAO,
		daoFactory.entityImportanceDAO,
		daoFactory.campaignDAO,
		worldStateChangelogDAO,
		daoFactory.graphRebuildDirtyDAO,
		providerApiKey,
		env
	);
}
