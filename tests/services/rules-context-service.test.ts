import { describe, expect, it } from "vitest";
import {
	type CampaignRule,
	RulesContextService,
} from "@/services/campaign/rules-context-service";

function makeRule(partial: Partial<CampaignRule>): CampaignRule {
	return {
		id: partial.id || crypto.randomUUID(),
		entityId: partial.entityId || partial.id || crypto.randomUUID(),
		entityType: partial.entityType || "house_rule",
		name: partial.name || "Rule",
		category: partial.category || "general",
		text: partial.text || "Default rule text",
		source: partial.source || "house",
		priority: partial.priority ?? 100,
		active: partial.active ?? true,
		updatedAt: partial.updatedAt || new Date().toISOString(),
		metadata: partial.metadata || {},
	};
}

describe("RulesContextService", () => {
	it("detects conflicts between similar rules with different numeric values", () => {
		const ruleA = makeRule({
			id: "rule-a",
			name: "Gritty healing",
			category: "healing",
			text: "Short rest takes 8 hours.",
			source: "house",
		});
		const ruleB = makeRule({
			id: "rule-b",
			entityType: "rules",
			name: "Default rest timing",
			category: "healing",
			text: "Short rest takes 1 hour.",
			source: "source",
			priority: 70,
		});

		const resolved = RulesContextService.resolveRules([ruleA, ruleB]);

		expect(resolved.conflicts.length).toBeGreaterThan(0);
		expect(resolved.warnings.length).toBeGreaterThan(0);
		expect(resolved.rules[0].id).toBe("rule-a");
	});

	it("builds readable system context and warns when rules conflict", () => {
		const resolved = RulesContextService.resolveRules([
			makeRule({
				id: "rule-a",
				category: "combat",
				text: "Short rest takes 8 hours in this campaign.",
				source: "house",
			}),
			makeRule({
				id: "rule-b",
				entityType: "rules",
				category: "combat",
				text: "Short rest takes 1 hour by default.",
				source: "source",
				priority: 70,
			}),
		]);

		const systemContext = RulesContextService.buildSystemContext(resolved);
		expect(systemContext).toContain("Campaign rules context");
		expect(systemContext).toContain("Rules warnings:");
		expect(systemContext).toContain("[house]");
	});
});
