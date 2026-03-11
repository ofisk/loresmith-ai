import type { D1Database } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	type CampaignRule,
	RulesContextService,
} from "@/services/campaign/rules-context-service";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	type ToolEnv,
	type ToolExecuteOptions,
} from "@/tools/utils";

interface RulesReferenceToolEnv extends ToolEnv {
	DB?: D1Database;
}

interface RuleExcerptResult {
	id: string;
	resultType: "source_excerpt" | "house_rule";
	title: string;
	excerpt: string;
	score: number;
	citation: {
		source: string;
		fileKey?: string;
		chunkIndex?: number;
		pageNumber?: number | null;
	};
}

const RULE_TAG_HINTS = new Set(["rulebook", "rules", "srd", "homebrew-rules"]);

const RULE_FILENAME_HINTS = [
	"rule",
	"rules",
	"srd",
	"handbook",
	"monster manual",
	"dungeon master",
	"player handbook",
];

const STAT_BLOCK_HINTS = [
	"armor class",
	"hit points",
	"speed",
	"strength",
	"dexterity",
	"constitution",
	"intelligence",
	"wisdom",
	"charisma",
	"challenge",
];

const searchRulesSchema = z.object({
	campaignId: commonSchemas.campaignId,
	query: z.string().min(1).describe("Rules question to search for."),
	limit: z.number().int().min(1).max(20).optional().default(8),
	includeHouseRules: z
		.boolean()
		.optional()
		.default(true)
		.describe("When true, include matching house rules in results."),
	jwt: commonSchemas.jwt,
});

const lookupStatBlockSchema = z.object({
	campaignId: commonSchemas.campaignId,
	name: z.string().min(1).describe("Creature or NPC name to locate."),
	limit: z.number().int().min(1).max(10).optional().default(5),
	jwt: commonSchemas.jwt,
});

const resolveRulesConflictSchema = z.object({
	campaignId: commonSchemas.campaignId,
	question: z
		.string()
		.min(1)
		.describe("Rules question that may conflict with table house rules."),
	jwt: commonSchemas.jwt,
});

function normalize(input: string): string {
	return input.trim().toLowerCase();
}

function tokenize(input: string): string[] {
	return normalize(input)
		.split(/\s+/)
		.filter((token) => token.length > 2);
}

function safeJsonParse(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "string" || value.length === 0) return null;
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function toTags(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.filter((tag) => typeof tag === "string") as string[];
	}
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag) => typeof tag === "string") as string[];
			}
		} catch {}
	}
	return [];
}

function inferPageNumber(metadata: unknown): number | null {
	const parsed = safeJsonParse(metadata);
	if (!parsed) return null;
	const candidates = [
		parsed.page,
		parsed.pageNumber,
		parsed.page_number,
		parsed.pdf_page,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			return candidate;
		}
		if (typeof candidate === "string") {
			const parsedNumber = Number.parseInt(candidate, 10);
			if (Number.isFinite(parsedNumber)) return parsedNumber;
		}
	}
	return null;
}

function buildExcerpt(text: string, queryTerms: string[]): string {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	if (normalizedText.length <= 360) return normalizedText;

	let firstMatchIndex = -1;
	for (const term of queryTerms) {
		const idx = normalize(normalizedText).indexOf(term);
		if (idx >= 0 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
			firstMatchIndex = idx;
		}
	}

	if (firstMatchIndex < 0) return `${normalizedText.slice(0, 357)}...`;

	const start = Math.max(0, firstMatchIndex - 80);
	const end = Math.min(normalizedText.length, firstMatchIndex + 260);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < normalizedText.length ? "..." : "";
	return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

function scoreChunk(text: string, query: string, queryTerms: string[]): number {
	const normalizedText = normalize(text);
	let score = 0;

	if (normalizedText.includes(normalize(query))) score += 5;
	for (const term of queryTerms) {
		if (normalizedText.includes(term)) score += 1;
	}
	return score;
}

function scoreStatBlockChunk(
	text: string,
	name: string,
	nameTerms: string[]
): number {
	const normalizedText = normalize(text);
	let score = 0;

	if (normalizedText.includes(normalize(name))) score += 6;
	for (const term of nameTerms) {
		if (normalizedText.includes(term)) score += 1;
	}
	for (const marker of STAT_BLOCK_HINTS) {
		if (normalizedText.includes(marker)) score += 1;
	}
	return score;
}

function isLikelyRulesResource(resource: {
	file_name?: string | null;
	display_name?: string | null;
	tags?: unknown;
	description?: string | null;
}): boolean {
	const tags = toTags(resource.tags).map((tag) => normalize(tag));
	if (tags.some((tag) => RULE_TAG_HINTS.has(tag))) return true;

	const haystacks = [
		resource.file_name ?? "",
		resource.display_name ?? "",
		resource.description ?? "",
	]
		.map((value) => normalize(value))
		.join(" ");

	return RULE_FILENAME_HINTS.some((hint) => haystacks.includes(hint));
}

async function searchRulesExcerpts(params: {
	env: RulesReferenceToolEnv;
	campaignId: string;
	query: string;
	limit: number;
}): Promise<RuleExcerptResult[]> {
	const { env, campaignId, query, limit } = params;
	const daoFactory = getDAOFactory(env);
	const queryTerms = tokenize(query);
	const resources =
		await daoFactory.campaignDAO.getCampaignResources(campaignId);
	const candidateResources = resources.filter((resource) =>
		isLikelyRulesResource(resource)
	);
	const resourcesToSearch =
		candidateResources.length > 0 ? candidateResources : resources;

	const chunkMatches: RuleExcerptResult[] = [];
	for (const resource of resourcesToSearch) {
		const fileKey = resource.file_key;
		if (!fileKey) continue;

		const chunks = await daoFactory.fileDAO.getFileChunks(fileKey);
		for (const chunk of chunks) {
			const score = scoreChunk(chunk.chunk_text, query, queryTerms);
			if (score <= 0) continue;

			chunkMatches.push({
				id: `${fileKey}:${chunk.chunk_index}`,
				resultType: "source_excerpt",
				title:
					resource.display_name ||
					resource.file_name ||
					`Rule source (${fileKey})`,
				excerpt: buildExcerpt(chunk.chunk_text, queryTerms),
				score,
				citation: {
					source:
						resource.display_name || resource.file_name || "Campaign resource",
					fileKey,
					chunkIndex: chunk.chunk_index,
					pageNumber: inferPageNumber(chunk.metadata),
				},
			});
		}
	}

	return chunkMatches.sort((a, b) => b.score - a.score).slice(0, limit);
}

function filterRelevantRules(
	question: string,
	rules: CampaignRule[]
): CampaignRule[] {
	const terms = tokenize(question);
	const normalizedQuestion = normalize(question);

	return rules.filter((rule) => {
		const haystack = normalize(`${rule.name} ${rule.category} ${rule.text}`);
		if (haystack.includes(normalizedQuestion)) return true;
		return terms.some((term) => haystack.includes(term));
	});
}

export const searchRulesTool = tool({
	description:
		"Search campaign-linked rules references and house rules for a rules question, with source citations when available.",
	inputSchema: searchRulesSchema,
	execute: async (
		input: z.infer<typeof searchRulesSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as RulesReferenceToolEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for rules lookup.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;

			const sourceMatches = await searchRulesExcerpts({
				env,
				campaignId: input.campaignId,
				query: input.query,
				limit: input.limit,
			});

			const results: RuleExcerptResult[] = [...sourceMatches];
			if (input.includeHouseRules) {
				const resolved = await RulesContextService.getResolvedRulesContext(
					env,
					input.campaignId
				);
				const matchingRules = filterRelevantRules(input.query, resolved.rules)
					.filter((rule) => rule.source === "house")
					.slice(0, input.limit);
				for (const rule of matchingRules) {
					results.push({
						id: `house:${rule.id}`,
						resultType: "house_rule",
						title: rule.name,
						excerpt: rule.text,
						score: 10,
						citation: {
							source: `House rule: ${rule.name}`,
						},
					});
				}
			}

			const sorted = results
				.sort((a, b) => b.score - a.score)
				.slice(0, input.limit);
			if (sorted.length === 0) {
				return createToolSuccess(
					"I could not find matching rules in your indexed campaign resources.",
					{
						query: input.query,
						results: [],
						hint: "Upload or link your rulebook or SRD files to this campaign, then try again.",
					},
					toolCallId
				);
			}

			return createToolSuccess(
				`Found ${sorted.length} rules reference match(es) for "${input.query}".`,
				{
					query: input.query,
					results: sorted,
					count: sorted.length,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[searchRulesTool] Error:", error);
			return createToolError(
				"Failed to search rules references",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const lookupStatBlockTool = tool({
	description:
		"Find a stat block excerpt for a creature or NPC name from indexed campaign resources, with source citation.",
	inputSchema: lookupStatBlockSchema,
	execute: async (
		input: z.infer<typeof lookupStatBlockSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as RulesReferenceToolEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for stat block lookup.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;

			const daoFactory = getDAOFactory(env);
			const resources = await daoFactory.campaignDAO.getCampaignResources(
				input.campaignId
			);
			const nameTerms = tokenize(input.name);
			const matches: RuleExcerptResult[] = [];

			for (const resource of resources) {
				const fileKey = resource.file_key;
				if (!fileKey) continue;
				const chunks = await daoFactory.fileDAO.getFileChunks(fileKey);
				for (const chunk of chunks) {
					const score = scoreStatBlockChunk(
						chunk.chunk_text,
						input.name,
						nameTerms
					);
					if (score < 7) continue;
					matches.push({
						id: `stat:${fileKey}:${chunk.chunk_index}`,
						resultType: "source_excerpt",
						title: resource.display_name || resource.file_name || input.name,
						excerpt: buildExcerpt(chunk.chunk_text, nameTerms),
						score,
						citation: {
							source:
								resource.display_name ||
								resource.file_name ||
								"Campaign resource",
							fileKey,
							chunkIndex: chunk.chunk_index,
							pageNumber: inferPageNumber(chunk.metadata),
						},
					});
				}
			}

			const topMatches = matches
				.sort((a, b) => b.score - a.score)
				.slice(0, input.limit);
			if (topMatches.length === 0) {
				return createToolSuccess(
					`I could not find a stat block for "${input.name}" in indexed campaign resources.`,
					{
						name: input.name,
						results: [],
						hint: "Upload or link the source rulebook or stat block document to this campaign, then try again.",
					},
					toolCallId
				);
			}

			return createToolSuccess(
				`Found ${topMatches.length} stat block match(es) for "${input.name}".`,
				{
					name: input.name,
					results: topMatches,
					count: topMatches.length,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[lookupStatBlockTool] Error:", error);
			return createToolError(
				"Failed to lookup stat block",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const resolveRulesConflictTool = tool({
	description:
		"Resolve a rules question against campaign house rules and source rules, returning precedence and conflict notes.",
	inputSchema: resolveRulesConflictSchema,
	execute: async (
		input: z.infer<typeof resolveRulesConflictSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options) as RulesReferenceToolEnv | null;
			if (!env || !env.DB) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for conflict resolution.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;

			const resolved = await RulesContextService.getResolvedRulesContext(
				env,
				input.campaignId
			);
			const relevantRules = filterRelevantRules(input.question, resolved.rules);
			const houseRules = relevantRules.filter(
				(rule) => rule.source === "house"
			);
			const officialRules = relevantRules.filter(
				(rule) => rule.source === "source"
			);
			const prioritized = [...relevantRules].sort((a, b) => {
				if (b.priority !== a.priority) return b.priority - a.priority;
				return b.updatedAt.localeCompare(a.updatedAt);
			});
			const effectiveRule = prioritized[0] ?? null;
			const relevantRuleIds = new Set(relevantRules.map((rule) => rule.id));
			const relevantConflicts = resolved.conflicts.filter(
				(conflict) =>
					relevantRuleIds.has(conflict.leftRuleId) ||
					relevantRuleIds.has(conflict.rightRuleId)
			);

			return createToolSuccess(
				`Resolved rules context for "${input.question}".`,
				{
					question: input.question,
					effectiveRule: effectiveRule
						? {
								id: effectiveRule.id,
								name: effectiveRule.name,
								text: effectiveRule.text,
								category: effectiveRule.category,
								source: effectiveRule.source,
								priority: effectiveRule.priority,
							}
						: null,
					houseRules: houseRules.map((rule) => ({
						id: rule.id,
						name: rule.name,
						text: rule.text,
						category: rule.category,
						priority: rule.priority,
					})),
					officialRules: officialRules.map((rule) => ({
						id: rule.id,
						name: rule.name,
						text: rule.text,
						category: rule.category,
						priority: rule.priority,
					})),
					conflicts: relevantConflicts,
					warnings: resolved.warnings,
					resolutionSummary: effectiveRule
						? effectiveRule.source === "house"
							? "House rule takes precedence for this question."
							: "No matching house-rule override found; source rule applies."
						: "No matching rules found in campaign context.",
				},
				toolCallId
			);
		} catch (error) {
			console.error("[resolveRulesConflictTool] Error:", error);
			return createToolError(
				"Failed to resolve rules conflict",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});
