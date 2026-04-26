import { ImportanceCalculationError } from "@/lib/errors";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

export type ShardImportanceLevel = "high" | "medium" | "low" | null;

export function getShardImportanceLevelFromMetadata(
	metadata: unknown
): ShardImportanceLevel {
	const m = metadata as {
		importanceScore?: number;
		importanceOverride?: unknown;
	};
	const importanceOverride = m?.importanceOverride as
		| ShardImportanceLevel
		| undefined;
	const importanceScore = m?.importanceScore as number | undefined;

	if (importanceOverride !== undefined) {
		return importanceOverride;
	}
	if (importanceScore !== undefined) {
		if (importanceScore >= 80) return "high";
		if (importanceScore >= 60) return "medium";
		return "low";
	}
	return null;
}

/**
 * PATCH entity importance; returns updated score from API when successful.
 */
export async function patchShardEntityImportance(params: {
	campaignId: string;
	entityId: string;
	newLevel: ShardImportanceLevel;
}): Promise<{ importanceScore?: number } | null> {
	const { campaignId, entityId, newLevel } = params;
	const jwt = getStoredJwt();
	if (!jwt) {
		throw new Error("No authentication token available");
	}

	const { response, jwtExpired } = await authenticatedFetchWithExpiration(
		API_CONFIG.buildUrl(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.IMPORTANCE(campaignId, entityId)
		),
		{
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${jwt}`,
			},
			body: JSON.stringify({ importanceLevel: newLevel }),
		}
	);

	if (jwtExpired) {
		throw new Error("Session expired. Please refresh the page.");
	}

	if (!response.ok) {
		const errorData = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		throw new ImportanceCalculationError(
			errorData.error || "Failed to update importance",
			response.status
		);
	}

	const result = (await response.json()) as {
		entity?: { metadata?: Record<string, unknown> };
	};
	if (!result.entity) {
		return null;
	}
	const score = (
		result.entity.metadata as { importanceScore?: number } | undefined
	)?.importanceScore;
	return {
		importanceScore: typeof score === "number" ? score : undefined,
	};
}
