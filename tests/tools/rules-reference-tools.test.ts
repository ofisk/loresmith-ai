import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignResources: vi.fn(),
	},
	fileDAO: {
		getFileChunks: vi.fn(),
	},
};

const { getResolvedRulesContextMock } = vi.hoisted(() => ({
	getResolvedRulesContextMock: vi.fn(),
}));

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/campaign/rules-context-service", () => ({
	RulesContextService: class {
		static getResolvedRulesContext = getResolvedRulesContextMock;
	},
}));

import {
	lookupStatBlockTool,
	resolveRulesConflictTool,
	searchRulesTool,
} from "@/tools/campaign-context/rules-reference-tools";

describe("rules reference tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			id: "campaign-1",
			name: "Curse of Strahd",
		});
		mockDaoFactory.campaignDAO.getCampaignResources.mockResolvedValue([
			{
				file_key: "library/ofisk/srd.pdf",
				file_name: "srd.pdf",
				display_name: "SRD 5e",
				description: "Official rules reference",
				tags: JSON.stringify(["rulebook", "srd"]),
			},
		]);
		mockDaoFactory.fileDAO.getFileChunks.mockResolvedValue([]);
		getResolvedRulesContextMock.mockResolvedValue({
			rules: [],
			conflicts: [],
			warnings: [],
		});
	});

	it("searchRulesTool returns cited source excerpts and matching house rules", async () => {
		mockDaoFactory.fileDAO.getFileChunks.mockResolvedValue([
			{
				chunk_index: 2,
				chunk_text:
					"Grappling: when you try to grapple a creature, make a Strength (Athletics) check contested by Strength (Athletics) or Dexterity (Acrobatics).",
				metadata: JSON.stringify({ page: 195 }),
			},
		]);
		getResolvedRulesContextMock.mockResolvedValue({
			rules: [
				{
					id: "rule-house-1",
					entityId: "rule-house-1",
					entityType: "house_rule",
					name: "Fast grapples",
					category: "combat",
					text: "Grapples resolve as a bonus action at this table.",
					source: "house",
					priority: 100,
					active: true,
					updatedAt: "2026-03-01T00:00:00.000Z",
					metadata: {},
				},
			],
			conflicts: [],
			warnings: [],
		});

		const result = await searchRulesTool.execute(
			{
				campaignId: "campaign-1",
				query: "How does grappling work?",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "rules-search-1", messages: [], env: { DB: {} } }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.count).toBeGreaterThan(0);
		expect(result.result.data.results[0].citation).toBeDefined();
	});

	it("lookupStatBlockTool returns stat-block-like excerpts with citations", async () => {
		mockDaoFactory.fileDAO.getFileChunks.mockResolvedValue([
			{
				chunk_index: 10,
				chunk_text:
					"Wolf. Armor Class 13, Hit Points 11, Speed 40 ft. STR 12 DEX 15 CON 12 INT 3 WIS 12 CHA 6. Challenge 1/4.",
				metadata: JSON.stringify({ pageNumber: 341 }),
			},
		]);

		const result = await lookupStatBlockTool.execute(
			{
				campaignId: "campaign-1",
				name: "Wolf",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "rules-stat-1", messages: [], env: { DB: {} } }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.results).toHaveLength(1);
		expect(result.result.data.results[0].citation.pageNumber).toBe(341);
	});

	it("resolveRulesConflictTool prefers house rules when relevant", async () => {
		getResolvedRulesContextMock.mockResolvedValue({
			rules: [
				{
					id: "rule-source-1",
					entityId: "rule-source-1",
					entityType: "rules",
					name: "Healing potion default",
					category: "healing",
					text: "Drinking a potion takes one action.",
					source: "source",
					priority: 70,
					active: true,
					updatedAt: "2026-03-01T00:00:00.000Z",
					metadata: {},
				},
				{
					id: "rule-house-2",
					entityId: "rule-house-2",
					entityType: "house_rule",
					name: "Bonus action healing",
					category: "healing",
					text: "At this table, drinking your own potion is a bonus action.",
					source: "house",
					priority: 100,
					active: true,
					updatedAt: "2026-03-01T01:00:00.000Z",
					metadata: {},
				},
			],
			conflicts: [
				{
					category: "healing",
					reason: "House rule differs from source rule",
					leftRuleId: "rule-source-1",
					rightRuleId: "rule-house-2",
				},
			],
			warnings: [],
		});

		const result = await resolveRulesConflictTool.execute(
			{
				campaignId: "campaign-1",
				question: "Is healing potion use an action or bonus action?",
				jwt: "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y",
			},
			{ toolCallId: "rules-conflict-1", messages: [], env: { DB: {} } }
		);

		expect(result.result.success).toBe(true);
		expect(result.result.data.effectiveRule.source).toBe("house");
		expect(result.result.data.conflicts).toHaveLength(1);
	});
});
