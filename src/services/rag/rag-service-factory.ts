import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { getEnvVar } from "@/lib/env-utils";
import { HistoricalContextService } from "./historical-context-service";
import { PlanningContextService } from "./planning-context-service";

type OptionalPlanningOptions = {
	openaiApiKey?: string;
};

function normalizeOpenAIKey(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function createPlanningContextService(
	db: D1Database | undefined,
	vectorize: VectorizeIndex | undefined,
	openaiApiKey: string | undefined,
	env: any
): PlanningContextService | null {
	if (!db || !vectorize || !openaiApiKey) {
		return null;
	}
	return new PlanningContextService(
		db,
		vectorize as VectorizeIndex,
		openaiApiKey,
		env
	);
}

export async function resolveOpenAIApiKey(
	env: any,
	options: OptionalPlanningOptions = {}
): Promise<string | undefined> {
	if (typeof options.openaiApiKey === "string") {
		return normalizeOpenAIKey(options.openaiApiKey);
	}
	const key = await getEnvVar(env, "OPENAI_API_KEY", false);
	return normalizeOpenAIKey(key);
}

export async function getPlanningServices(
	env: any,
	options: OptionalPlanningOptions = {}
): Promise<{
	planningContext: PlanningContextService | null;
	historicalContext: HistoricalContextService | null;
	openaiApiKey?: string;
}> {
	const openaiApiKey = await resolveOpenAIApiKey(env, options);
	const planningContext = createPlanningContextService(
		env.DB,
		env.VECTORIZE,
		openaiApiKey,
		env
	);
	const historicalContext =
		env.DB && env.R2
			? new HistoricalContextService({
					db: env.DB,
					r2: env.R2,
					vectorize: env.VECTORIZE,
					openaiApiKey,
					env,
				})
			: null;

	return {
		planningContext,
		historicalContext,
		openaiApiKey,
	};
}
