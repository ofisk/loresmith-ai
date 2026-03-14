import type { D1Database } from "@cloudflare/workers-types";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { CAMPAIGN_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";
import { getDAOFactory } from "@/dao/dao-factory";
import { createToolError, extractUsernameFromJwt } from "./tool-utils";

/** Re-export for v6 tool execute signature. */
export type { ToolExecutionOptions };

/** Re-export pure tool helpers. */
export {
	createAuthHeaders,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
} from "./tool-utils";

/**
 * Options passed to tool execute (v6). Base agent extends with env when running in Worker/DO.
 */
export type ToolExecuteOptions = ToolExecutionOptions & { env?: unknown };

/**
 * Minimal context passed to tool execute functions (e.g. from Durable Object).
 * env is set when running inside a Worker/DO; toolCallId may be set by the runtime.
 */
export interface ToolContext {
	env?: unknown;
	toolCallId?: string;
}

/**
 * Minimal env shape available from tool context (Worker/DO bindings).
 * Used so tools can safely access env.DB, env.VECTORIZE, etc. when present.
 */
export interface ToolEnv {
	DB?: D1Database;
	VECTORIZE?: unknown;
	OPENAI_API_KEY?: unknown;
	[key: string]: unknown;
}

/**
 * Common tool parameter schemas
 */
export const commonSchemas = {
	jwt: z
		.string()
		.nullable()
		.optional()
		.describe("JWT token for authentication"),

	campaignId: z.string().describe("The unique identifier for the campaign"),

	username: z.string().describe("The username for authentication"),
};

/**
 * Get campaign name from campaignId (async helper for tools)
 */
export async function getCampaignName(
	campaignId: string | null | undefined,
	env: ToolEnv | unknown,
	jwt: string | null | undefined
): Promise<string | null> {
	if (!campaignId || !env || !jwt) {
		return null;
	}

	try {
		const userId = extractUsernameFromJwt(jwt);
		if (!userId) {
			return null;
		}

		const daoFactory = getDAOFactory(env);
		const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
			campaignId,
			userId
		);

		return campaign?.name || null;
	} catch (_error) {
		return null;
	}
}

/**
 * Require the user to have a GM role for this campaign. Call at the start of GM-only tools.
 * Returns a ToolResult error if the user is a player; returns null if allowed (GM or owner).
 */
export async function requireGMRole(
	env: ToolEnv,
	campaignId: string,
	userId: string,
	toolCallId: string
): Promise<ToolResult | null> {
	const daoFactory = getDAOFactory(env);
	const role = await daoFactory.campaignDAO.getCampaignRole(campaignId, userId);
	if (role && PLAYER_ROLES.has(role)) {
		return createToolError(
			"This action is not available.",
			"This action is limited to GM tools.",
			403,
			toolCallId
		);
	}
	return null;
}

/**
 * Require campaign-level access for a JWT user.
 * Returns the authenticated userId and campaign record when access is allowed.
 */
export async function requireCampaignAccessForTool(params: {
	env: ToolEnv;
	campaignId: string;
	jwt: string | null | undefined;
	toolCallId: string;
}): Promise<
	| {
			userId: string;
			campaign: {
				campaignId: string;
				name: string;
				description: string | null;
				metadata: string | null;
			};
	  }
	| ToolResult
> {
	const { env, campaignId, jwt, toolCallId } = params;
	const userId = extractUsernameFromJwt(jwt);
	if (!userId) {
		return createToolError(
			"Invalid authentication token",
			"Authentication failed",
			401,
			toolCallId
		);
	}

	const access = await requireCampaignAccessByUserIdForTool({
		env,
		campaignId,
		userId,
		toolCallId,
	});
	if ("toolCallId" in access) {
		return access;
	}

	return { userId, campaign: access.campaign };
}

export async function requireCampaignAccessByUserIdForTool(params: {
	env: ToolEnv;
	campaignId: string;
	userId: string;
	toolCallId: string;
}): Promise<
	| {
			campaign: {
				campaignId: string;
				name: string;
				description: string | null;
				metadata: string | null;
			};
	  }
	| ToolResult
> {
	const { env, campaignId, userId, toolCallId } = params;
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

	return {
		campaign: {
			campaignId: campaign.campaignId,
			name: campaign.name,
			description: campaign.description ?? null,
			metadata: campaign.metadata ?? null,
		},
	};
}

/**
 * Execute API request with standard error handling
 */
export async function executeApiRequest(
	url: string,
	options: RequestInit = {}
): Promise<{ success: boolean; data?: unknown; error?: string }> {
	try {
		const response = await fetch(url, options);

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `HTTP ${response.status}: ${errorText}`,
			};
		}

		const data = await response.json();
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check if running in Durable Object context
 */
export function isDurableObjectContext(
	context?: { env?: unknown } | null
): boolean {
	return context?.env !== undefined;
}

/**
 * Get environment from context with fallback
 */
export function getEnvironment(
	context?: { env?: unknown } | null
): Record<string, unknown> {
	return (context?.env as Record<string, unknown>) ?? {};
}

/**
 * Get env from tool context (Durable Object or Worker). Returns null when not
 * running in a context that provides env, so callers can fall back to API.
 */
export function getEnvFromContext(context: unknown): ToolEnv | null {
	const c = context as { env?: unknown } | null | undefined;
	if (c?.env) return c.env as ToolEnv;
	if (typeof globalThis !== "undefined" && "env" in globalThis) {
		return (globalThis as unknown as { env: unknown }).env as ToolEnv;
	}
	return null;
}

/**
 * Run tool logic with env (DB path) or API fallback.
 * If no env: calls apiCall() (e.g. authenticatedFetch).
 * If env: extracts userId from JWT; if missing returns authErrorResult; else calls dbCall(env, userId).
 */
export async function runWithEnvOrApi<T>(params: {
	context: unknown;
	jwt: string | null | undefined;
	apiCall: () => Promise<T>;
	dbCall: (env: unknown, userId: string) => Promise<T>;
	authErrorResult: T;
}): Promise<T> {
	const { context, jwt, apiCall, dbCall, authErrorResult } = params;
	const env = getEnvFromContext(context);

	if (!env) {
		return apiCall();
	}

	const userId = extractUsernameFromJwt(jwt);
	if (!userId) {
		return authErrorResult;
	}

	return dbCall(env, userId);
}

const SPOILER_ROLES = new Set<string>([
	CAMPAIGN_ROLES.OWNER,
	CAMPAIGN_ROLES.EDITOR_GM,
	CAMPAIGN_ROLES.READONLY_GM,
]);

export function canSeeSpoilersForCampaignRole(
	role: string | null | undefined
): boolean {
	if (!role) return false;
	return SPOILER_ROLES.has(role);
}

/**
 * Enforce GM-only spoiler access for tools that expose campaign planning / spoilers.
 *
 * This is intentionally server-side and DAO-backed so it cannot be bypassed by
 * calling the tool directly from an agent.
 */
export async function requireCanSeeSpoilersForTool(params: {
	env: unknown;
	campaignId: string;
	jwt: string | null | undefined;
	toolCallId: string;
}): Promise<{ userId: string; role: string } | ToolResult> {
	const { env, campaignId, jwt, toolCallId } = params;

	const userId = extractUsernameFromJwt(jwt);
	if (!userId) {
		return createToolError(
			"Invalid authentication token",
			"Authentication failed",
			401,
			toolCallId,
			campaignId
		);
	}

	const daoFactory = getDAOFactory(env);
	const role = await daoFactory.campaignDAO.getCampaignRole(campaignId, userId);
	if (!role) {
		return createToolError(
			"Campaign not found",
			"Campaign not found or access denied",
			404,
			toolCallId,
			campaignId
		);
	}

	if (!canSeeSpoilersForCampaignRole(role)) {
		return createToolError(
			"Access denied",
			"You do not have permission to view or modify campaign planning information.",
			403,
			toolCallId,
			campaignId
		);
	}

	return { userId, role };
}
