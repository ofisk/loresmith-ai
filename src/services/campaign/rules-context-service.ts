import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";

export type CampaignRuleSource = "house" | "source" | "context";

export interface CampaignRule {
	id: string;
	entityId: string;
	entityType: string;
	name: string;
	category: string;
	text: string;
	source: CampaignRuleSource;
	priority: number;
	active: boolean;
	updatedAt: string;
	metadata: Record<string, unknown>;
}

export interface RuleConflict {
	category: string;
	reason: string;
	leftRuleId: string;
	rightRuleId: string;
}

export interface ResolvedRulesContext {
	rules: CampaignRule[];
	conflicts: RuleConflict[];
	warnings: string[];
}

const RULE_ENTITY_TYPES = [
	"house_rule",
	"rules",
	"conversational_context",
] as const;
const RULE_NOTE_TYPES = new Set([
	"house_rule",
	"rules",
	"rule",
	"table_rule",
	"source_rule",
	"mechanic_rule",
]);

function metadataOf(entity: Entity): Record<string, unknown> {
	if (!entity.metadata || typeof entity.metadata !== "object") {
		return {};
	}
	return entity.metadata as Record<string, unknown>;
}

function asText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	return "";
}

function inferCategory(
	entity: Entity,
	metadata: Record<string, unknown>
): string {
	const metadataCategory = asText(metadata.category);
	if (metadataCategory) return metadataCategory;

	const content =
		entity.content &&
		typeof entity.content === "object" &&
		!Array.isArray(entity.content)
			? (entity.content as Record<string, unknown>)
			: {};
	const contentCategory = asText(content.category);
	if (contentCategory) return contentCategory;

	return "general";
}

function inferRuleText(
	entity: Entity,
	metadata: Record<string, unknown>
): string {
	const content =
		entity.content &&
		typeof entity.content === "object" &&
		!Array.isArray(entity.content)
			? (entity.content as Record<string, unknown>)
			: {};

	const candidates = [
		content.text,
		content.summary,
		content.one_line,
		content.procedure,
		metadata.ruleText,
	];
	for (const candidate of candidates) {
		const text = asText(candidate);
		if (text) return text;
	}
	return "";
}

function inferRuleSource(
	entity: Entity,
	metadata: Record<string, unknown>
): CampaignRuleSource {
	if (entity.entityType === "house_rule") return "house";
	const noteType = asText(metadata.noteType).toLowerCase();
	if (noteType === "house_rule" || noteType === "table_rule") return "house";
	if (entity.entityType === "rules") return "source";
	return "context";
}

function inferPriority(source: CampaignRuleSource): number {
	// table-specific rules first, then source rules, then contextual notes
	if (source === "house") return 100;
	if (source === "source") return 70;
	return 50;
}

function isActiveRuleEntity(entity: Entity): boolean {
	const metadata = metadataOf(entity);
	const shardStatus = asText(metadata.shardStatus || entity.shardStatus || "");
	if (
		shardStatus === "staging" ||
		shardStatus === "rejected" ||
		shardStatus === "deleted"
	) {
		return false;
	}
	if (metadata.ignored === true || metadata.rejected === true) {
		return false;
	}
	if (typeof metadata.active === "boolean" && metadata.active === false) {
		return false;
	}
	return true;
}

function looksLikeRuleEntity(entity: Entity): boolean {
	if (!RULE_ENTITY_TYPES.includes(entity.entityType as any)) {
		return false;
	}
	if (entity.entityType !== "conversational_context") {
		return true;
	}
	const noteType = asText(metadataOf(entity).noteType).toLowerCase();
	return RULE_NOTE_TYPES.has(noteType);
}

function normalizeRule(entity: Entity): CampaignRule | null {
	const metadata = metadataOf(entity);
	if (!looksLikeRuleEntity(entity) || !isActiveRuleEntity(entity)) {
		return null;
	}

	const text = inferRuleText(entity, metadata);
	if (!text) return null;

	const source = inferRuleSource(entity, metadata);
	const category = inferCategory(entity, metadata);
	const name =
		asText(entity.name) || asText(metadata.displayName) || `Rule ${entity.id}`;
	const active = metadata.active !== false;

	return {
		id: entity.id,
		entityId: entity.id,
		entityType: entity.entityType,
		name,
		category,
		text,
		source,
		priority: inferPriority(source),
		active,
		updatedAt: entity.updatedAt,
		metadata,
	};
}

function tokenize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, " ")
			.split(/\s+/)
			.map((t) => t.trim())
			.filter((t) => t.length >= 3)
	);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const token of a) {
		if (b.has(token)) shared++;
	}
	return shared / Math.min(a.size, b.size);
}

function hasNegation(text: string): boolean {
	return /\b(not|never|cannot|can't|without|forbid|forbidden|no)\b/i.test(text);
}

function extractNumberMap(text: string): Map<string, string> {
	const map = new Map<string, string>();
	const regex =
		/\b(short rest|long rest|healing|death save|concentration|initiative|critical hit|encounter|spell slot|rest)\b[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(hours?|days?|minutes?|rounds?|checks?)?/gi;
	for (const match of text.matchAll(regex)) {
		const key = (match[1] || "").toLowerCase().trim();
		const value =
			`${match[2] || ""} ${(match[3] || "").toLowerCase().trim()}`.trim();
		if (key && value) {
			map.set(key, value);
		}
	}
	return map;
}

function detectConflict(
	left: CampaignRule,
	right: CampaignRule
): string | null {
	if (left.id === right.id) return null;
	if (
		left.category !== right.category &&
		left.category !== "general" &&
		right.category !== "general"
	) {
		return null;
	}

	const leftTokens = tokenize(left.text);
	const rightTokens = tokenize(right.text);
	const overlap = overlapRatio(leftTokens, rightTokens);
	if (overlap < 0.3) return null;

	const negationMismatch = hasNegation(left.text) !== hasNegation(right.text);
	if (negationMismatch) {
		return "Opposite polarity detected for similar rule statements.";
	}

	const leftNumbers = extractNumberMap(left.text);
	const rightNumbers = extractNumberMap(right.text);
	for (const [key, leftValue] of leftNumbers.entries()) {
		const rightValue = rightNumbers.get(key);
		if (rightValue && leftValue !== rightValue) {
			return `Different numeric values detected for "${key}" (${leftValue} vs ${rightValue}).`;
		}
	}

	return null;
}

function buildWarnings(
	rules: CampaignRule[],
	conflicts: RuleConflict[]
): string[] {
	const warnings: string[] = [];
	if (conflicts.length > 0) {
		warnings.push(
			"Conflicting campaign rules detected. Show both interpretations, prefer table-specific rules in generated guidance, and ask for clarification when ambiguity remains."
		);
	}
	if (rules.length === 0) {
		warnings.push("No active campaign rules found.");
	}
	return warnings;
}

export class RulesContextService {
	static async getActiveRulesForCampaign(
		env: unknown,
		campaignId: string
	): Promise<CampaignRule[]> {
		const daoFactory = getDAOFactory(env);
		const entityDAO = daoFactory.entityDAO;

		const batches = await Promise.all(
			RULE_ENTITY_TYPES.map((entityType) =>
				entityDAO.listEntitiesByCampaign(campaignId, {
					entityType,
					excludeShardStatuses: ["rejected", "deleted"],
					limit: 500,
					orderBy: "updated_at",
				})
			)
		);

		return batches
			.flat()
			.map((entity) => normalizeRule(entity))
			.filter((rule): rule is CampaignRule => !!rule)
			.sort((a, b) => b.priority - a.priority);
	}

	static resolveRules(rules: CampaignRule[]): ResolvedRulesContext {
		const conflicts: RuleConflict[] = [];
		for (let i = 0; i < rules.length; i++) {
			for (let j = i + 1; j < rules.length; j++) {
				const reason = detectConflict(rules[i], rules[j]);
				if (!reason) continue;
				conflicts.push({
					category:
						rules[i].category === "general"
							? rules[j].category
							: rules[i].category,
					reason,
					leftRuleId: rules[i].id,
					rightRuleId: rules[j].id,
				});
			}
		}

		return {
			rules,
			conflicts,
			warnings: buildWarnings(rules, conflicts),
		};
	}

	static async getResolvedRulesContext(
		env: unknown,
		campaignId: string
	): Promise<ResolvedRulesContext> {
		const rules = await RulesContextService.getActiveRulesForCampaign(
			env,
			campaignId
		);
		return RulesContextService.resolveRules(rules);
	}

	static buildSystemContext(resolved: ResolvedRulesContext): string {
		if (resolved.rules.length === 0) {
			return "Campaign rules context: no active rules found.";
		}

		const topRules = resolved.rules.slice(0, 20).map((rule) => {
			return `- [${rule.source}] (${rule.category}) ${rule.name}: ${rule.text}`;
		});

		const warningLines = resolved.warnings.map((warning) => `- ${warning}`);
		return [
			"Campaign rules context:",
			"Use these rules when generating responses. If rules conflict, show both sides, prefer table-specific rules, and include a warning.",
			...topRules,
			...(warningLines.length > 0 ? ["Rules warnings:", ...warningLines] : []),
		].join("\n");
	}
}
