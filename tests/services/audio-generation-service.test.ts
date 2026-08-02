import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyUser = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUser }));

const logVerboseAudioSpend = vi.fn();
vi.mock("@/lib/llm-usage-verbose-log", () => ({
	logVerboseAudioSpend,
	logVerboseLlmSpend: vi.fn(),
	isVerboseLlmSpendEnabled: () => false,
}));

const campaignAudioDAO = {
	createAudio: vi.fn().mockResolvedValue(undefined),
	completeAudio: vi.fn().mockResolvedValue(undefined),
	failAudio: vi.fn().mockResolvedValue(undefined),
	getAudioById: vi.fn(),
	deleteAudio: vi.fn().mockResolvedValue(undefined),
};
const campaignDAO = { getCampaignById: vi.fn() };
const entityDAO = { getEntityById: vi.fn() };

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: () => ({ campaignAudioDAO, campaignDAO, entityDAO }),
}));

vi.mock("@/lib/env-utils", () => ({
	getEnvVar: async (env: Record<string, unknown>, key: string) =>
		(env[key] as string) ?? "",
}));

const {
	buildAudioR2Key,
	deleteCampaignAudio,
	prepareAudioGeneration,
	runAudioGeneration,
} = await import("@/services/audio/audio-generation-service");

/**
 * Orchestration for #756. The behaviour worth pinning is what happens when
 * generation goes wrong, because this code runs detached on `waitUntil` where an
 * unhandled rejection would be completely invisible: every failure must land as
 * a `failed` row plus a notification, never as a silent drop.
 */

const CAMPAIGN_ROW = {
	name: "The Drowned Crown",
	description: "A grim campaign in flooded crypts.",
	game_system: "dnd5e",
	metadata: JSON.stringify({ tone: "grim, waterlogged" }),
};

const PENDING_RECORD = {
	id: "audio-1",
	campaignId: "campaign-1",
	kind: "voice" as const,
	title: "Voice: Ferryman",
	description: null,
	prompt: "You should not have come back here.",
	r2Key: null,
	contentType: null,
	durationSec: null,
	sizeBytes: null,
	provider: null,
	model: null,
	status: "pending" as const,
	errorMessage: null,
	loopable: false,
	source: null,
	createdBy: "gm",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

function makeEnv(overrides: Record<string, unknown> = {}) {
	return {
		R2: {
			put: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
		},
		AI: { run: vi.fn().mockResolvedValue(new Uint8Array(48_000).fill(7)) },
		...overrides,
		// A stand-in for the Worker Env; only the bindings used here are real.
	} as unknown as Parameters<typeof runAudioGeneration>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	campaignDAO.getCampaignById.mockResolvedValue(CAMPAIGN_ROW);
	campaignAudioDAO.getAudioById.mockResolvedValue(PENDING_RECORD);
});

describe("buildAudioR2Key", () => {
	it("scopes the object to its campaign", () => {
		expect(buildAudioR2Key("campaign-1", "audio-1")).toBe(
			"campaigns/campaign-1/audio/audio-1.mp3"
		);
	});
});

describe("prepareAudioGeneration", () => {
	it("writes a pending row before any provider is called", async () => {
		const env = makeEnv();

		await prepareAudioGeneration(env, {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
			line: "You should not have come back here.",
		});

		expect(campaignAudioDAO.createAudio).toHaveBeenCalledOnce();
		// Nothing has been generated or stored yet.
		expect(env.R2.put).not.toHaveBeenCalled();
	});

	it("builds the prompt from campaign tone, not from a bare user string", async () => {
		await prepareAudioGeneration(makeEnv(), {
			campaignId: "campaign-1",
			kind: "music",
			username: "gm",
		});

		const [, input] = campaignAudioDAO.createAudio.mock.calls[0];
		expect(input.prompt).toContain("dark, ominous, low strings");
	});

	it("pulls sensory detail from a linked entity", async () => {
		entityDAO.getEntityById.mockResolvedValue({
			name: "The Weeping Crypt",
			entityType: "location",
			content: { description: "A flooded tomb of standing water." },
		});

		await prepareAudioGeneration(makeEnv(), {
			campaignId: "campaign-1",
			kind: "ambience",
			username: "gm",
			entityId: "entity-1",
		});

		const [, input] = campaignAudioDAO.createAudio.mock.calls[0];
		expect(input.prompt).toContain("dripping and trickling water");
		expect(input.source).toEqual({
			kind: "entity",
			id: "entity-1",
			label: "The Weeping Crypt",
		});
	});

	it("defaults ambience to looping and voice to one-shot", async () => {
		await prepareAudioGeneration(makeEnv(), {
			campaignId: "campaign-1",
			kind: "ambience",
			username: "gm",
			hint: "rain",
		});
		expect(campaignAudioDAO.createAudio.mock.calls[0][1].loopable).toBe(true);

		campaignAudioDAO.createAudio.mockClear();

		await prepareAudioGeneration(makeEnv(), {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
			line: "Hello.",
		});
		expect(campaignAudioDAO.createAudio.mock.calls[0][1].loopable).toBe(false);
	});

	it("refuses to start for a campaign that does not exist", async () => {
		campaignDAO.getCampaignById.mockResolvedValue(null);

		await expect(
			prepareAudioGeneration(makeEnv(), {
				campaignId: "nope",
				kind: "ambience",
				username: "gm",
				hint: "rain",
			})
		).rejects.toThrow(/campaign not found/i);
	});
});

describe("runAudioGeneration", () => {
	it("stores the blob, marks the row ready, and notifies the GM", async () => {
		const env = makeEnv();

		await runAudioGeneration(env, PENDING_RECORD, {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
		});

		expect(env.R2.put).toHaveBeenCalledWith(
			"campaigns/campaign-1/audio/audio-1.mp3",
			expect.anything(),
			expect.objectContaining({
				httpMetadata: { contentType: "audio/mpeg" },
			})
		);
		expect(campaignAudioDAO.completeAudio).toHaveBeenCalledOnce();
		expect(notifyUser).toHaveBeenCalledWith(
			env,
			"gm",
			expect.objectContaining({ type: "audio_ready" })
		);
	});

	it("meters spend in seconds and flags it as an estimate", async () => {
		await runAudioGeneration(makeEnv(), PENDING_RECORD, {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
		});

		expect(logVerboseAudioSpend).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				intent: "audio_voice",
				secondsAreEstimate: true,
				provider: "workers-ai",
			})
		);
		// Seconds, never tokens — folding them together would corrupt token totals.
		const payload = logVerboseAudioSpend.mock.calls[0][1];
		expect(payload.seconds).toBeGreaterThan(0);
		expect(payload).not.toHaveProperty("tokens");
	});

	it("records a failure and notifies instead of rejecting on waitUntil", async () => {
		const env = makeEnv({
			AI: { run: vi.fn().mockRejectedValue(new Error("model exploded")) },
		});

		// Must not throw: nothing is listening for a rejection here.
		await expect(
			runAudioGeneration(env, PENDING_RECORD, {
				campaignId: "campaign-1",
				kind: "voice",
				username: "gm",
			})
		).resolves.toBeUndefined();

		expect(campaignAudioDAO.failAudio).toHaveBeenCalledOnce();
		expect(notifyUser).toHaveBeenCalledWith(
			env,
			"gm",
			expect.objectContaining({ type: "audio_generation_failed" })
		);
	});

	it("does not leak the provider's raw error to the GM", async () => {
		const env = makeEnv({
			AI: {
				run: vi
					.fn()
					.mockRejectedValue(new Error("account acct_9f quota 0/500")),
			},
		});

		await runAudioGeneration(env, PENDING_RECORD, {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
		});

		const [, reason] = campaignAudioDAO.failAudio.mock.calls[0];
		expect(reason).not.toContain("acct_9f");
	});

	it("marks an unavailable kind as non-retryable, since retrying cannot help", async () => {
		// No gateway configured, so music has no provider at all.
		const env = makeEnv();

		await runAudioGeneration(
			env,
			{ ...PENDING_RECORD, kind: "music" as const },
			{ campaignId: "campaign-1", kind: "music", username: "gm" }
		);

		const payload = notifyUser.mock.calls.at(-1)?.[2];
		expect(payload.data.retryable).toBe(false);
		// The platform gap is explained verbatim; it is a real limitation.
		expect(payload.message).toMatch(/music model/i);
	});

	it("keeps a provider failure retryable", async () => {
		const env = makeEnv({
			AI: { run: vi.fn().mockRejectedValue(new Error("timeout")) },
		});

		await runAudioGeneration(env, PENDING_RECORD, {
			campaignId: "campaign-1",
			kind: "voice",
			username: "gm",
		});

		expect(notifyUser.mock.calls.at(-1)?.[2].data.retryable).toBe(true);
	});

	it("survives a notification failure without losing the generated track", async () => {
		notifyUser.mockRejectedValueOnce(new Error("DO unreachable"));
		const env = makeEnv();

		await expect(
			runAudioGeneration(env, PENDING_RECORD, {
				campaignId: "campaign-1",
				kind: "voice",
				username: "gm",
			})
		).resolves.toBeUndefined();

		expect(campaignAudioDAO.completeAudio).toHaveBeenCalledOnce();
	});
});

describe("deleteCampaignAudio", () => {
	it("removes the blob and the row together so R2 keeps no orphan", async () => {
		const env = makeEnv();

		await deleteCampaignAudio(env, {
			...PENDING_RECORD,
			r2Key: "campaigns/campaign-1/audio/audio-1.mp3",
		});

		expect(env.R2.delete).toHaveBeenCalledWith(
			"campaigns/campaign-1/audio/audio-1.mp3"
		);
		expect(campaignAudioDAO.deleteAudio).toHaveBeenCalledWith("audio-1");
	});

	it("still deletes the row when generation never produced a file", async () => {
		const env = makeEnv();

		await deleteCampaignAudio(env, PENDING_RECORD);

		expect(env.R2.delete).not.toHaveBeenCalled();
		expect(campaignAudioDAO.deleteAudio).toHaveBeenCalledWith("audio-1");
	});
});
