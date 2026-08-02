import { beforeEach, describe, expect, it, vi } from "vitest";

const campaignAudioDAO = {
	listAudioForCampaign: vi.fn(),
	getAudioById: vi.fn(),
};

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => ({ campaignAudioDAO })),
}));

const requireCampaignAccessForTool = vi.fn();
const requireGMRole = vi.fn();
const getEnvFromContext = vi.fn();

vi.mock("@/tools/utils", async () => {
	const actual =
		await vi.importActual<typeof import("@/tools/utils")>("@/tools/utils");
	return {
		...actual,
		requireCampaignAccessForTool: (...args: unknown[]) =>
			requireCampaignAccessForTool(...args),
		requireGMRole: (...args: unknown[]) => requireGMRole(...args),
		getEnvFromContext: (...args: unknown[]) => getEnvFromContext(...args),
	};
});

const getAudioCapabilities = vi.fn();
const prepareAudioGeneration = vi.fn();
const deleteCampaignAudio = vi.fn();

vi.mock("@/services/audio/audio-generation-service", () => ({
	getAudioCapabilities: (...a: unknown[]) => getAudioCapabilities(...a),
	prepareAudioGeneration: (...a: unknown[]) => prepareAudioGeneration(...a),
	deleteCampaignAudio: (...a: unknown[]) => deleteCampaignAudio(...a),
}));

import type { ToolResult } from "@/app-constants";
import {
	deleteCampaignAudioTool,
	generateCampaignAudioTool,
	listCampaignAudioTool,
} from "@/tools/campaign-context/audio-tools";

/**
 * The audio agent tools for #756.
 *
 * The behaviour worth pinning: the tool must refuse a kind this deployment
 * cannot serve BEFORE writing a row, and it must never tell the GM a track is
 * ready — generation is detached and the notification is what reports success.
 */

const ALL_AVAILABLE = [
	{ kind: "ambience", available: true, provider: "gw", reason: null },
	{ kind: "music", available: true, provider: "gw", reason: null },
	{ kind: "voice", available: true, provider: "workers-ai", reason: null },
	{ kind: "creature", available: true, provider: "gw", reason: null },
];

const OPTIONS = { toolCallId: "call-1" };

function run(tool: unknown, input: Record<string, unknown>) {
	return (
		tool as { execute: (i: unknown, o: unknown) => Promise<ToolResult> }
	).execute(input, OPTIONS);
}

beforeEach(() => {
	vi.clearAllMocks();
	getEnvFromContext.mockReturnValue({ DB: {} });
	requireCampaignAccessForTool.mockResolvedValue({
		userId: "gm",
		campaign: { name: "The Drowned Crown" },
	});
	requireGMRole.mockResolvedValue(null);
	getAudioCapabilities.mockResolvedValue(ALL_AVAILABLE);
});

describe("generateCampaignAudioTool", () => {
	it("starts a generation and reports it as started, not finished", async () => {
		prepareAudioGeneration.mockResolvedValue({
			record: {
				id: "audio-1",
				kind: "ambience",
				title: "Ambience: crypt",
				status: "pending",
				prompt: "dripping water",
			},
			run: vi.fn().mockResolvedValue(undefined),
		});

		const result = await run(generateCampaignAudioTool, {
			campaignId: "campaign-1",
			kind: "ambience",
			hint: "dripping crypt",
			jwt: "jwt",
		});

		expect(result.result.data.status).toBe("pending");
		expect(result.result.message).toMatch(/started generating/i);
	});

	it("refuses a kind with no provider before writing anything", async () => {
		getAudioCapabilities.mockResolvedValue([
			{
				kind: "music",
				available: false,
				provider: null,
				reason: "Theme music needs a music model.",
			},
		]);

		const result = await run(generateCampaignAudioTool, {
			campaignId: "campaign-1",
			kind: "music",
			hint: "villain theme",
			jwt: "jwt",
		});

		expect(result.result.message).toMatch(/music model/i);
		expect(prepareAudioGeneration).not.toHaveBeenCalled();
	});

	it("requires a line before spending anything on an NPC voice", async () => {
		const result = await run(generateCampaignAudioTool, {
			campaignId: "campaign-1",
			kind: "voice",
			jwt: "jwt",
		});

		expect(result.result.message).toMatch(/line of dialogue is required/i);
		expect(prepareAudioGeneration).not.toHaveBeenCalled();
	});

	it("is closed to player roles", async () => {
		requireGMRole.mockResolvedValue({
			toolCallId: "call-1",
			result: { message: "This action is not available.", code: 403 },
		});

		await run(generateCampaignAudioTool, {
			campaignId: "campaign-1",
			kind: "ambience",
			hint: "rain",
			jwt: "jwt",
		});

		expect(prepareAudioGeneration).not.toHaveBeenCalled();
	});

	it("reports a preparation failure rather than throwing at the agent", async () => {
		prepareAudioGeneration.mockRejectedValue(new Error("Campaign not found"));

		const result = await run(generateCampaignAudioTool, {
			campaignId: "campaign-1",
			kind: "ambience",
			hint: "rain",
			jwt: "jwt",
		});

		expect(result.result.success).toBe(false);
		expect(result.result.data.errorCode).toBe(500);
	});
});

describe("listCampaignAudioTool", () => {
	it("summarizes saved tracks", async () => {
		campaignAudioDAO.listAudioForCampaign.mockResolvedValue([
			{
				id: "audio-1",
				title: "Ambience: crypt",
				kind: "ambience",
				status: "ready",
				durationSec: 20,
				loopable: true,
			},
		]);

		const result = await run(listCampaignAudioTool, {
			campaignId: "campaign-1",
			jwt: "jwt",
		});

		expect(result.result.message).toMatch(/found 1 audio track\./i);
		expect(result.result.data.audio).toHaveLength(1);
	});

	it("says so plainly when a campaign has no audio", async () => {
		campaignAudioDAO.listAudioForCampaign.mockResolvedValue([]);

		const result = await run(listCampaignAudioTool, {
			campaignId: "campaign-1",
			jwt: "jwt",
		});

		expect(result.result.message).toMatch(/no audio tracks/i);
	});
});

describe("deleteCampaignAudioTool", () => {
	it("deletes a track that belongs to the campaign", async () => {
		campaignAudioDAO.getAudioById.mockResolvedValue({
			id: "audio-1",
			campaignId: "campaign-1",
			title: "Ambience: crypt",
		});

		const result = await run(deleteCampaignAudioTool, {
			campaignId: "campaign-1",
			audioId: "audio-1",
			jwt: "jwt",
		});

		expect(deleteCampaignAudio).toHaveBeenCalled();
		expect(result.result.message).toMatch(/deleted/i);
	});

	it("will not delete a track belonging to another campaign", async () => {
		campaignAudioDAO.getAudioById.mockResolvedValue({
			id: "audio-1",
			campaignId: "campaign-2",
			title: "Someone else's",
		});

		const result = await run(deleteCampaignAudioTool, {
			campaignId: "campaign-1",
			audioId: "audio-1",
			jwt: "jwt",
		});

		expect(result.result.success).toBe(false);
		expect(result.result.data.errorCode).toBe(404);
		expect(deleteCampaignAudio).not.toHaveBeenCalled();
	});
});
