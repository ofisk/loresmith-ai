import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRecapDAO, RecapMemberRow } from "@/dao/player-recap-dao";
import {
	PlayerRecapService,
	RecapAlreadySentError,
	RecapEmptyError,
	RecapNoRecipientsError,
	RecapNotEditableError,
	RecapNotEnabledError,
} from "@/services/session-digest/player-recap-service";
import type { PlayerRecapEmail } from "@/types/player-recap";
import type { SessionDigestWithData } from "@/types/session-digest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
	Resend: class {
		emails = { send: (...args: unknown[]) => sendMock(...args) };
	},
}));

function makeDigest(
	overrides: Partial<SessionDigestWithData> = {}
): SessionDigestWithData {
	return {
		id: "digest-1",
		campaignId: "campaign-1",
		sessionNumber: 3,
		sessionDate: "2026-07-01",
		status: "approved",
		qualityScore: null,
		reviewNotes: null,
		generatedByAi: false,
		templateId: null,
		sourceType: "manual",
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-01T00:00:00.000Z",
		digestData: {
			last_session_recap: {
				key_events: ["The siege broke"],
				state_changes: { factions: [], locations: [], npcs: ["Yorel"] },
				open_threads: ["Who paid them?"],
			},
			next_session_plan: {
				objectives_dm: ["SPOILER"],
				probable_player_goals: [],
				beats: [],
				if_then_branches: [],
			},
			npcs_to_run: [],
			locations_in_focus: [],
			encounter_seeds: [],
			clues_and_revelations: [],
			treasure_and_rewards: [],
			todo_checklist: [],
		},
		...overrides,
	};
}

function makeRecap(
	overrides: Partial<PlayerRecapEmail> = {}
): PlayerRecapEmail {
	return {
		id: "recap-1",
		campaignId: "campaign-1",
		digestId: "digest-1",
		sessionNumber: 3,
		subject: "Campaign — Session 3 recap",
		bodyMarkdown: "## What happened\n\n- The siege broke\n",
		nextSessionDate: null,
		status: "draft",
		createdBy: "gm",
		sentBy: null,
		sentAt: null,
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

function makeDao(overrides: Partial<PlayerRecapDAO> = {}) {
	const dao = {
		getSettings: vi.fn().mockResolvedValue({
			campaignId: "campaign-1",
			enabled: true,
		}),
		setSettings: vi.fn(),
		getRecapByDigestId: vi.fn().mockResolvedValue(null),
		deleteDraftForDigest: vi.fn().mockResolvedValue(undefined),
		createRecap: vi.fn().mockResolvedValue(makeRecap()),
		getRecapById: vi.fn().mockResolvedValue(makeRecap()),
		listRecapsByCampaign: vi.fn().mockResolvedValue([]),
		updateDraft: vi.fn().mockResolvedValue(1),
		claimForSend: vi.fn().mockResolvedValue(true),
		markSendFailed: vi.fn().mockResolvedValue(undefined),
		resetToDraft: vi.fn().mockResolvedValue(1),
		recordDelivery: vi.fn().mockResolvedValue(undefined),
		listDeliveries: vi.fn().mockResolvedValue([]),
		listPlayerMembers: vi.fn().mockResolvedValue([]),
		ensureUnsubscribeToken: vi.fn().mockResolvedValue("tok-1"),
		unsubscribeByToken: vi.fn().mockResolvedValue(null),
		...overrides,
	} as unknown as PlayerRecapDAO;
	return dao;
}

function makeService(dao: PlayerRecapDAO, resendApiKey = "re_test") {
	return new PlayerRecapService({
		db: {} as D1Database,
		dao,
		appOrigin: "https://loresmith.ai/",
		resendApiKey,
		fromAddress: "LoreSmith <recaps@loresmith.ai>",
	});
}

const VERIFIED_PLAYER: RecapMemberRow = {
	username: "alice",
	email: "alice@example.com",
	email_verified_at: "2026-01-01T00:00:00.000Z",
	unsubscribed_at: null,
};

beforeEach(() => {
	sendMock.mockReset();
	sendMock.mockResolvedValue({ error: null });
});

describe("generateDraft", () => {
	it("refuses when recaps are not enabled for the campaign", async () => {
		const dao = makeDao({
			getSettings: vi
				.fn()
				.mockResolvedValue({ campaignId: "campaign-1", enabled: false }),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).generateDraft({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				digest: makeDigest(),
				createdBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapNotEnabledError);
	});

	it("refuses when the digest has no player-safe content", async () => {
		const digest = makeDigest();
		digest.digestData.last_session_recap = {
			key_events: [],
			state_changes: { factions: [], locations: [], npcs: [] },
			open_threads: [],
		};

		await expect(
			makeService(makeDao()).generateDraft({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				digest,
				createdBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapEmptyError);
	});

	it("refuses to regenerate over a sent recap", async () => {
		const dao = makeDao({
			getRecapByDigestId: vi
				.fn()
				.mockResolvedValue(makeRecap({ status: "sent" })),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).generateDraft({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				digest: makeDigest(),
				createdBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapAlreadySentError);
	});

	it("creates a draft whose body carries no GM-only content", async () => {
		const dao = makeDao();
		const result = await makeService(dao).generateDraft({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			digest: makeDigest(),
			createdBy: "gm",
		});

		const created = (dao.createRecap as ReturnType<typeof vi.fn>).mock
			.calls[0][0];
		expect(created.bodyMarkdown).toContain("The siege broke");
		expect(created.bodyMarkdown).not.toContain("SPOILER");
		expect(result.spoilerFlags).toEqual([]);
	});

	it("replaces an existing draft rather than leaving two sendable copies", async () => {
		const dao = makeDao({
			getRecapByDigestId: vi.fn().mockResolvedValue(makeRecap()),
		} as Partial<PlayerRecapDAO>);

		await makeService(dao).generateDraft({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			digest: makeDigest(),
			createdBy: "gm",
		});

		expect(dao.deleteDraftForDigest).toHaveBeenCalledWith("digest-1");
	});
});

describe("getRecipients", () => {
	it("classifies each player and explains exclusions", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([
				VERIFIED_PLAYER,
				{
					username: "bob",
					email: null,
					email_verified_at: null,
					unsubscribed_at: null,
				},
				{
					username: "carol",
					email: "carol@example.com",
					email_verified_at: null,
					unsubscribed_at: null,
				},
				{
					username: "dan",
					email: "dan@example.com",
					email_verified_at: "2026-01-01T00:00:00.000Z",
					unsubscribed_at: "2026-06-01T00:00:00.000Z",
				},
			]),
		} as Partial<PlayerRecapDAO>);

		const recipients = await makeService(dao).getRecipients("campaign-1");

		expect(recipients.map((r) => [r.username, r.eligible, r.reason])).toEqual([
			["alice", true, "ok"],
			["bob", false, "no_email"],
			["carol", false, "email_unverified"],
			["dan", false, "unsubscribed"],
		]);
	});
});

describe("send", () => {
	it("refuses to send a recap that is already sent", async () => {
		const dao = makeDao({
			getRecapById: vi.fn().mockResolvedValue(makeRecap({ status: "sent" })),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).send({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				recapId: "recap-1",
				sentBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapAlreadySentError);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("refuses when nobody is eligible", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([
				{
					username: "carol",
					email: "carol@example.com",
					email_verified_at: null,
					unsubscribed_at: null,
				},
			]),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).send({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				recapId: "recap-1",
				sentBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapNoRecipientsError);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("mails only eligible players and records each delivery", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([
				VERIFIED_PLAYER,
				{
					username: "dan",
					email: "dan@example.com",
					email_verified_at: "2026-01-01T00:00:00.000Z",
					unsubscribed_at: "2026-06-01T00:00:00.000Z",
				},
			]),
			getRecapById: vi
				.fn()
				.mockResolvedValueOnce(makeRecap())
				.mockResolvedValue(makeRecap({ status: "sent" })),
		} as Partial<PlayerRecapDAO>);

		const result = await makeService(dao).send({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			recapId: "recap-1",
			sentBy: "gm",
		});

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock.mock.calls[0][0].to).toEqual(["alice@example.com"]);
		expect(result.sent).toBe(1);
		expect(result.skipped).toBe(1);
		expect(dao.recordDelivery).toHaveBeenCalledTimes(1);
	});

	it("includes a one-click unsubscribe header on every email", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([VERIFIED_PLAYER]),
		} as Partial<PlayerRecapDAO>);

		await makeService(dao).send({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			recapId: "recap-1",
			sentBy: "gm",
		});

		const payload = sendMock.mock.calls[0][0];
		expect(payload.headers["List-Unsubscribe"]).toBe(
			"<https://loresmith.ai/recap-unsubscribe/tok-1>"
		);
		expect(payload.headers["List-Unsubscribe-Post"]).toBe(
			"List-Unsubscribe=One-Click"
		);
		expect(payload.html).toContain(
			"https://loresmith.ai/recap-unsubscribe/tok-1"
		);
	});

	it("does not send when another request already claimed the draft", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([VERIFIED_PLAYER]),
			claimForSend: vi.fn().mockResolvedValue(false),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).send({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				recapId: "recap-1",
				sentBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapAlreadySentError);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("marks the recap failed only when no email got through", async () => {
		sendMock.mockResolvedValue({ error: "smtp down" });
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([VERIFIED_PLAYER]),
		} as Partial<PlayerRecapDAO>);

		const result = await makeService(dao).send({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			recapId: "recap-1",
			sentBy: "gm",
		});

		expect(result.failed).toBe(1);
		expect(dao.markSendFailed).toHaveBeenCalledWith("recap-1");
	});

	it("keeps a partial success sent, so a retry cannot re-mail anyone", async () => {
		sendMock
			.mockResolvedValueOnce({ error: null })
			.mockResolvedValueOnce({ error: "bounced" });
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([
				VERIFIED_PLAYER,
				{
					username: "erin",
					email: "erin@example.com",
					email_verified_at: "2026-01-01T00:00:00.000Z",
					unsubscribed_at: null,
				},
			]),
		} as Partial<PlayerRecapDAO>);

		const result = await makeService(dao).send({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			recapId: "recap-1",
			sentBy: "gm",
		});

		expect(result.sent).toBe(1);
		expect(result.failed).toBe(1);
		expect(dao.markSendFailed).not.toHaveBeenCalled();
	});

	it("does not mail a player who unsubscribed from an earlier recap", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([
				VERIFIED_PLAYER,
				{
					username: "dan",
					email: "dan@example.com",
					email_verified_at: "2026-01-01T00:00:00.000Z",
					unsubscribed_at: "2026-06-01T00:00:00.000Z",
				},
			]),
		} as Partial<PlayerRecapDAO>);

		await makeService(dao).send({
			campaignId: "campaign-1",
			campaignName: "Campaign",
			recapId: "recap-1",
			sentBy: "gm",
		});

		const addressed = sendMock.mock.calls.flatMap((call) => call[0].to);
		expect(addressed).toEqual(["alice@example.com"]);
		expect(addressed).not.toContain("dan@example.com");
		// Nor may a send touch their subscription row and revive them.
		expect(dao.ensureUnsubscribeToken).not.toHaveBeenCalledWith(
			"campaign-1",
			"dan",
			expect.anything()
		);
	});

	it("fails loudly when email delivery is not configured", async () => {
		const dao = makeDao({
			listPlayerMembers: vi.fn().mockResolvedValue([VERIFIED_PLAYER]),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao, "").send({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				recapId: "recap-1",
				sentBy: "gm",
			})
		).rejects.toThrow(/RESEND_API_KEY/);
	});

	it("refuses when recaps were disabled after the draft was written", async () => {
		const dao = makeDao({
			getSettings: vi
				.fn()
				.mockResolvedValue({ campaignId: "campaign-1", enabled: false }),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).send({
				campaignId: "campaign-1",
				campaignName: "Campaign",
				recapId: "recap-1",
				sentBy: "gm",
			})
		).rejects.toBeInstanceOf(RecapNotEnabledError);
	});
});

describe("updateDraft", () => {
	it("refuses to edit a sent recap", async () => {
		const dao = makeDao({
			getRecapById: vi.fn().mockResolvedValue(makeRecap({ status: "sent" })),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).updateDraft("recap-1", { subject: "new" })
		).rejects.toBeInstanceOf(RecapNotEditableError);
	});

	it("refuses when the row left draft between read and write", async () => {
		const dao = makeDao({
			updateDraft: vi.fn().mockResolvedValue(0),
		} as Partial<PlayerRecapDAO>);

		await expect(
			makeService(dao).updateDraft("recap-1", { subject: "new" })
		).rejects.toBeInstanceOf(RecapNotEditableError);
	});
});

describe("unsubscribe", () => {
	it("resolves the token to the campaign and player it belongs to", async () => {
		const dao = makeDao({
			unsubscribeByToken: vi
				.fn()
				.mockResolvedValue({ campaignId: "campaign-1", username: "alice" }),
		} as Partial<PlayerRecapDAO>);

		await expect(makeService(dao).unsubscribe("tok-1")).resolves.toEqual({
			campaignId: "campaign-1",
			username: "alice",
		});
		expect(dao.unsubscribeByToken).toHaveBeenCalledWith("tok-1");
	});

	it("returns null for an unknown token rather than throwing", async () => {
		await expect(
			makeService(makeDao()).unsubscribe("nope")
		).resolves.toBeNull();
	});

	it("does not require the campaign to have recaps enabled", async () => {
		// A GM may switch recaps off after mailing. Links already in players'
		// inboxes must keep working regardless.
		const dao = makeDao({
			getSettings: vi
				.fn()
				.mockResolvedValue({ campaignId: "campaign-1", enabled: false }),
			unsubscribeByToken: vi
				.fn()
				.mockResolvedValue({ campaignId: "campaign-1", username: "alice" }),
		} as Partial<PlayerRecapDAO>);

		await expect(makeService(dao).unsubscribe("tok-1")).resolves.not.toBeNull();
	});
});
