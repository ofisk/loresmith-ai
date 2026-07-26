import type { D1Database } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	ContinuityCheckerService,
	type ResolveFindingInput,
} from "@/services/continuity/continuity-checker-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolEnv,
	type ToolExecuteOptions,
} from "@/tools/utils";
import {
	CONTINUITY_FINDING_TYPES,
	type ContinuityFinding,
} from "@/types/continuity";

interface ContinuityToolEnv extends ToolEnv {
	DB?: D1Database;
}

const findingTypeSchema = z.enum(
	CONTINUITY_FINDING_TYPES as unknown as [string, ...string[]]
);

const checkContinuitySchema = z.object({
	campaignId: commonSchemas.campaignId,
	mode: z
		.enum(["incremental", "full"])
		.optional()
		.default("incremental")
		.describe(
			"incremental checks only sessions newer than the last scan; full rescans the whole campaign and costs considerably more."
		),
	types: z
		.array(findingTypeSchema)
		.optional()
		.describe("Restrict the scan to specific finding types."),
	minConfidence: z
		.enum(["high", "medium", "low"])
		.optional()
		.default("medium")
		.describe("Lowest confidence to record. Defaults to medium and above."),
	maxCandidates: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.describe("Cap on candidates reviewed by the model tiers this run."),
	jwt: commonSchemas.jwt,
});

const listFindingsSchema = z.object({
	campaignId: commonSchemas.campaignId,
	status: z
		.enum(["open", "confirmed", "dismissed", "corrected"])
		.optional()
		.default("open")
		.describe("Filter by adjudication status."),
	types: z
		.array(findingTypeSchema)
		.optional()
		.describe("Restrict to specific finding types."),
	highConfidenceOnly: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			"Show only high-confidence findings. Defaults to true so the report stays trustworthy."
		),
	limit: z.number().int().min(1).max(100).optional().default(25),
	jwt: commonSchemas.jwt,
});

const resolveFindingSchema = z.object({
	campaignId: commonSchemas.campaignId,
	findingId: z.string().min(1).describe("The continuity finding to resolve."),
	action: z
		.enum(["confirm", "dismiss", "correct"])
		.describe(
			"confirm records it as a real problem; dismiss retires it permanently; correct also writes the fix back to world state."
		),
	note: z
		.string()
		.optional()
		.describe("Optional GM note recorded with the resolution."),
	correctedEntityId: z
		.string()
		.optional()
		.describe(
			"Entity to correct. Defaults to the finding's subject. Required for 'correct' when the finding has no subject."
		),
	correctedStatus: z
		.string()
		.optional()
		.describe("The corrected world state status. Required for 'correct'."),
	campaignSessionId: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Session the correction applies to, when known."),
	jwt: commonSchemas.jwt,
});

/** Shape a finding for chat: the question plus both sides, nothing more. */
function summarizeFinding(finding: ContinuityFinding) {
	return {
		id: finding.id,
		type: finding.findingType,
		confidence: finding.confidence,
		question: finding.question,
		detail: finding.detail,
		subject: finding.subjectName,
		status: finding.status,
		evidence: finding.evidence.map((item) => ({
			label: item.label,
			sessionNumber: item.sessionNumber,
			excerpt: item.excerpt,
			referenceId: item.referenceId,
		})),
	};
}

async function requireGmCampaignAccess(
	env: ContinuityToolEnv,
	campaignId: string,
	jwt: string | null | undefined,
	toolCallId: string
) {
	const access = await requireCampaignAccessForTool({
		env,
		campaignId,
		jwt,
		toolCallId,
	});
	if ("toolCallId" in access) {
		return { error: access, campaignName: null } as const;
	}
	const gmError = await requireGMRole(
		env,
		campaignId,
		access.userId,
		toolCallId
	);
	if (gmError) return { error: gmError, campaignName: null } as const;
	return {
		error: null,
		campaignName: access.campaign.name,
		userId: access.userId,
	} as const;
}

/**
 * ContinuityToolEnv carries an index signature, so an `in` check cannot
 * discriminate it from a ToolResult. Return an explicit tagged result instead.
 */
function requireDb(
	options: ToolExecuteOptions | undefined,
	toolCallId: string
):
	| { env: ContinuityToolEnv & { DB: D1Database }; error: null }
	| { env: null; error: ToolResult } {
	const env = getEnvFromContext(options) as ContinuityToolEnv | null;
	if (!env?.DB) {
		return {
			env: null,
			error: createToolError(
				"Environment not available",
				"Direct database access is required for continuity checks.",
				500,
				toolCallId
			),
		};
	}
	return { env: env as ContinuityToolEnv & { DB: D1Database }, error: null };
}

export const checkCampaignContinuityTool = tool({
	description:
		"Scan a campaign for likely continuity problems — entities referenced after being recorded dead or destroyed, timeline conflicts, unexplained faction reversals, rulings that clash with house rules, and unresolved plot threads. Reports questions with citations, not errors.",
	inputSchema: checkContinuitySchema,
	execute: async (
		input: z.infer<typeof checkContinuitySchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const { env, error: envError } = requireDb(options, toolCallId);
			if (envError) return envError;

			const access = await requireGmCampaignAccess(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const service = new ContinuityCheckerService({
				db: env.DB,
				env: env as Record<string, unknown>,
			});
			const result = await service.scan(input.campaignId, {
				mode: input.mode ?? "incremental",
				types: input.types as never,
				// Schema defaults only apply when the AI SDK validates input, so
				// restate them here; the service would otherwise fall back to
				// persisting low-confidence findings.
				minConfidence: input.minConfidence ?? "medium",
				maxCandidates: input.maxCandidates,
			});

			const message =
				result.findingsCreated === 0
					? `No new continuity questions for "${access.campaignName}".`
					: `Found ${result.findingsCreated} continuity question(s) for "${access.campaignName}".`;

			return createToolSuccess(
				message,
				{
					scanId: result.scanId,
					mode: result.mode,
					scannedFromSession: result.scannedFromSession,
					scannedToSession: result.scannedToSession,
					candidatesGenerated: result.candidatesGenerated,
					candidatesAlreadyKnown: result.candidatesAlreadyKnown,
					findingsCreated: result.findingsCreated,
					truncated: result.truncated,
					warnings: result.warnings,
					findings: result.findings.map(summarizeFinding),
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to check campaign continuity",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const listContinuityFindingsTool = tool({
	description:
		"List continuity findings previously detected for a campaign, newest and highest-confidence first.",
	inputSchema: listFindingsSchema,
	execute: async (
		input: z.infer<typeof listFindingsSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const { env, error: envError } = requireDb(options, toolCallId);
			if (envError) return envError;

			const access = await requireGmCampaignAccess(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const status = input.status ?? "open";
			const findings = await getDAOFactory(
				env
			).continuityFindingDAO.listFindingsForCampaign(input.campaignId, {
				status,
				types: input.types as never,
				limit: input.limit ?? 25,
			});

			// Default to the quiet behaviour on an omitted flag rather than
			// relying on the schema default — a caller that invokes execute()
			// directly must not accidentally get the noisy report.
			const highConfidenceOnly = input.highConfidenceOnly !== false;
			const visible = highConfidenceOnly
				? findings.filter((finding) => finding.confidence === "high")
				: findings;

			return createToolSuccess(
				visible.length === 0
					? `No ${status} continuity findings for "${access.campaignName}".`
					: `${visible.length} ${status} continuity finding(s) for "${access.campaignName}".`,
				{
					total: findings.length,
					shown: visible.length,
					highConfidenceOnly,
					findings: visible.map(summarizeFinding),
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to list continuity findings",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

const RESOLUTION_VERBS: Record<
	z.infer<typeof resolveFindingSchema>["action"],
	string
> = {
	confirm: "Confirmed",
	dismiss: "Dismissed",
	correct: "Corrected",
};

function toResolveInput(
	input: z.infer<typeof resolveFindingSchema>,
	resolvedBy: string | null
): ResolveFindingInput {
	return {
		action: input.action,
		note: input.note ?? null,
		resolvedBy,
		correction: {
			entityId: input.correctedEntityId ?? null,
			status: input.correctedStatus ?? null,
			campaignSessionId: input.campaignSessionId ?? null,
		},
	};
}

export const resolveContinuityFindingTool = tool({
	description:
		"Confirm, dismiss, or correct a continuity finding. Dismissed findings never resurface; corrections are written back to campaign world state.",
	inputSchema: resolveFindingSchema,
	execute: async (
		input: z.infer<typeof resolveFindingSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const { env, error: envError } = requireDb(options, toolCallId);
			if (envError) return envError;

			const access = await requireGmCampaignAccess(
				env,
				input.campaignId,
				input.jwt,
				toolCallId
			);
			if (access.error) return access.error;

			const service = new ContinuityCheckerService({
				db: env.DB,
				env: env as Record<string, unknown>,
			});
			const result = await service.resolveFinding(
				input.campaignId,
				input.findingId,
				toResolveInput(input, access.userId ?? null)
			);

			return createToolSuccess(
				`${RESOLUTION_VERBS[input.action]} continuity finding for "${access.campaignName}".`,
				{
					finding: summarizeFinding(result.finding),
					changelogEntryId: result.changelogEntryId,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Failed to resolve continuity finding",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});
