import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateStructuredOutput = vi.fn();
const mockCampaignDAO = {
	getCampaignByIdWithMapping: vi.fn(),
	getCampaignRole: vi.fn(),
};
const mockEntityDAO = {
	getEntityById: vi.fn(),
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({
		campaignDAO: mockCampaignDAO,
		entityDAO: mockEntityDAO,
	})),
}));

vi.mock("@/lib/env-utils", () => ({
	getEnvVar: vi.fn(async () => "test-api-key"),
}));

vi.mock("@/services/llm/llm-provider-factory", () => ({
	createLLMProvider: vi.fn(() => ({
		generateStructuredOutput: mockGenerateStructuredOutput,
	})),
}));

import {
	exportHandoutTool,
	generateHandoutTool,
} from "@/tools/campaign-context/player-handout-tools";

function createJwt(username: string): string {
	const payload = Buffer.from(JSON.stringify({ username }), "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
	return `header.${payload}.signature`;
}

describe("player handout tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCampaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			campaignId: "campaign-1",
			name: "Ravenfall",
			description: "Dark fantasy campaign",
			metadata: "{}",
		});
	});

	it("denies handout generation for player roles", async () => {
		mockCampaignDAO.getCampaignRole.mockResolvedValue("editor_player");

		const result = await generateHandoutTool.execute(
			{
				campaignId: "campaign-1",
				entityId: "entity-1",
				format: "prose",
				jwt: createJwt("player-user"),
			},
			{
				toolCallId: "tool-1",
				env: {},
				messages: [],
			}
		);

		expect(result.result.success).toBe(false);
		expect(result.result.message).toBe("This action is not available.");
	});

	it("generates handout prompt without GM-only fields", async () => {
		mockCampaignDAO.getCampaignRole.mockResolvedValue("editor_gm");
		mockEntityDAO.getEntityById.mockResolvedValue({
			id: "entity-1",
			campaignId: "campaign-1",
			entityType: "npc",
			name: "Thornwall steward",
			content: {
				summary: "A weary steward managing the keep.",
				secrets: "Serves the hidden villain in the crypt below.",
			},
			metadata: {},
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		mockGenerateStructuredOutput.mockResolvedValue({
			title: "Whispers from Thornwall Keep",
			content: "The steward keeps watch as storms gather over old stones.",
			format: "prose",
			safetyNotes: [],
		});

		const result = await generateHandoutTool.execute(
			{
				campaignId: "campaign-1",
				entityId: "entity-1",
				format: "prose",
				jwt: createJwt("gm-user"),
			},
			{
				toolCallId: "tool-2",
				env: {},
				messages: [],
			}
		);

		expect(result.result.success).toBe(true);
		expect(mockGenerateStructuredOutput).toHaveBeenCalledTimes(1);
		const prompt = String(mockGenerateStructuredOutput.mock.calls[0][0]);
		expect(prompt).toContain("A weary steward managing the keep.");
		expect(prompt).not.toContain("hidden villain");
		expect(prompt).not.toContain('"secrets"');
	});

	it("exports markdown and text handouts to R2", async () => {
		mockCampaignDAO.getCampaignRole.mockResolvedValue("editor_gm");
		const r2Put = vi.fn().mockResolvedValue(undefined);
		const env = {
			R2: {
				put: r2Put,
			},
		};

		const markdownResult = await exportHandoutTool.execute(
			{
				campaignId: "campaign-1",
				title: "Thornwall notice",
				entityName: "Thornwall Keep",
				format: "notice",
				content: "By decree, the western gate closes at dusk.",
				exportFormat: "markdown",
				jwt: createJwt("gm-user"),
			},
			{
				toolCallId: "tool-3",
				env,
				messages: [],
			}
		);

		const textResult = await exportHandoutTool.execute(
			{
				campaignId: "campaign-1",
				title: "Tavern whispers",
				entityName: "Thornwall Keep",
				format: "tavern_gossip",
				content: "Some say a bell tolls from beneath the keep.",
				exportFormat: "text",
				jwt: createJwt("gm-user"),
			},
			{
				toolCallId: "tool-4",
				env,
				messages: [],
			}
		);

		expect(markdownResult.result.success).toBe(true);
		expect(textResult.result.success).toBe(true);
		expect(r2Put).toHaveBeenCalledTimes(2);
		expect(String(r2Put.mock.calls[0][0])).toContain(
			"exports/handouts/campaign-1/"
		);
		expect(String(r2Put.mock.calls[1][0])).toContain(
			"exports/handouts/campaign-1/"
		);

		const markdownBuffer = r2Put.mock.calls[0][1] as ArrayBuffer;
		const markdownText = new TextDecoder().decode(markdownBuffer);
		expect(markdownText).toContain("# Thornwall notice");
		expect(markdownText).toContain(
			"By decree, the western gate closes at dusk."
		);

		const textBuffer = r2Put.mock.calls[1][1] as ArrayBuffer;
		const textExport = new TextDecoder().decode(textBuffer);
		expect(textExport).toContain("Tavern whispers");
		expect(textExport).toContain(
			"Some say a bell tolls from beneath the keep."
		);
	});
});
