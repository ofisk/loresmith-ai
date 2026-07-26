// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const makeRequestWithData = vi.fn();

vi.mock("@/hooks/useAuthenticatedRequest", () => ({
	useAuthenticatedRequest: () => ({
		makeRequest: vi.fn(),
		makeRequestWithData,
	}),
}));

const { usePlayerRecaps } = await import("@/hooks/usePlayerRecaps");

const RECAP = {
	id: "recap-1",
	campaignId: "campaign-1",
	digestId: "digest-1",
	sessionNumber: 3,
	subject: "Session 3",
	bodyMarkdown: "The party lived.",
	nextSessionDate: null,
	status: "draft" as const,
	createdBy: "gm",
	sentBy: null,
	sentAt: null,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

/** The last URL passed to the mocked request, for endpoint assertions. */
function lastUrl(): string {
	return makeRequestWithData.mock.calls.at(-1)?.[0] as string;
}

function lastInit(): RequestInit | undefined {
	return makeRequestWithData.mock.calls.at(-1)?.[1] as RequestInit | undefined;
}

beforeEach(() => {
	makeRequestWithData.mockReset();
});

describe("usePlayerRecaps", () => {
	it("starts with nothing loaded and no error", () => {
		const { result } = renderHook(() => usePlayerRecaps());

		expect(result.current.settings).toBeNull();
		expect(result.current.draft).toBeNull();
		expect(result.current.recipients).toEqual([]);
		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBeNull();
	});

	it("loads campaign recap settings", async () => {
		const settings = { campaignId: "campaign-1", enabled: true };
		makeRequestWithData.mockResolvedValue({ settings });

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.fetchSettings("campaign-1");
		});

		expect(lastUrl()).toContain("/campaigns/campaign-1/player-recaps/settings");
		expect(result.current.settings).toEqual(settings);
		expect(result.current.loading).toBe(false);
	});

	it("sends the opt-in flag when updating settings", async () => {
		const settings = { campaignId: "campaign-1", enabled: false };
		makeRequestWithData.mockResolvedValue({ settings });

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.updateSettings("campaign-1", false);
		});

		expect(lastInit()?.method).toBe("PUT");
		expect(JSON.parse(lastInit()?.body as string)).toEqual({ enabled: false });
		expect(result.current.settings).toEqual(settings);
	});

	it("loads the audience preview", async () => {
		const recipients = [
			{
				username: "ana",
				email: "ana@example.com",
				eligible: true,
				reason: "ok",
			},
			{ username: "bo", email: null, eligible: false, reason: "no_email" },
		];
		makeRequestWithData.mockResolvedValue({ recipients });

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.fetchRecipients("campaign-1");
		});

		expect(lastUrl()).toContain(
			"/campaigns/campaign-1/player-recaps/recipients"
		);
		expect(result.current.recipients).toEqual(recipients);
	});

	it("generates a draft against the digest endpoint", async () => {
		makeRequestWithData.mockResolvedValue({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft("campaign-1", "digest-1");
		});

		expect(lastUrl()).toContain(
			"/campaigns/campaign-1/session-digests/digest-1/player-recap"
		);
		expect(lastInit()?.method).toBe("POST");
		expect(result.current.draft?.recap).toEqual(RECAP);
	});

	it("defaults the next session date to null when the caller omits it", async () => {
		makeRequestWithData.mockResolvedValue({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft("campaign-1", "digest-1");
		});

		expect(JSON.parse(lastInit()?.body as string)).toEqual({
			nextSessionDate: null,
		});
	});

	it("forwards an explicit next session date", async () => {
		makeRequestWithData.mockResolvedValue({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft(
				"campaign-1",
				"digest-1",
				"2026-02-01"
			);
		});

		expect(JSON.parse(lastInit()?.body as string)).toEqual({
			nextSessionDate: "2026-02-01",
		});
	});

	it("replaces only the recap when saving edits, keeping the spoiler flags", async () => {
		const spoilerFlags = [
			{ section: "whatHappened" as const, index: 0, text: "a", match: "b" },
		];
		makeRequestWithData.mockResolvedValueOnce({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags,
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft("campaign-1", "digest-1");
		});

		const edited = { ...RECAP, subject: "Edited" };
		makeRequestWithData.mockResolvedValueOnce({ recap: edited });
		await act(async () => {
			await result.current.saveDraft("campaign-1", "recap-1", {
				subject: "Edited",
			});
		});

		expect(lastUrl()).toContain("/campaigns/campaign-1/player-recaps/recap-1");
		expect(lastInit()?.method).toBe("PUT");
		expect(result.current.draft?.recap.subject).toBe("Edited");
		expect(result.current.draft?.spoilerFlags).toEqual(spoilerFlags);
	});

	it("does not invent a draft when saving with none loaded", async () => {
		makeRequestWithData.mockResolvedValue({ recap: RECAP });

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.saveDraft("campaign-1", "recap-1", {
				subject: "Edited",
			});
		});

		expect(result.current.draft).toBeNull();
	});

	it("records deliveries on the draft after a send", async () => {
		makeRequestWithData.mockResolvedValueOnce({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft("campaign-1", "digest-1");
		});

		const sentRecap = { ...RECAP, status: "sent" as const };
		const deliveries = [
			{
				id: "d1",
				recapId: "recap-1",
				username: "ana",
				email: "ana@example.com",
				status: "sent" as const,
				error: null,
				createdAt: "2026-01-01T00:00:00Z",
			},
		];
		makeRequestWithData.mockResolvedValueOnce({
			recap: sentRecap,
			sent: 1,
			failed: 0,
			skipped: 0,
			deliveries,
		});

		await act(async () => {
			await result.current.sendRecap("campaign-1", "recap-1");
		});

		expect(lastUrl()).toContain(
			"/campaigns/campaign-1/player-recaps/recap-1/send"
		);
		expect(lastInit()?.method).toBe("POST");
		expect(result.current.draft?.recap.status).toBe("sent");
		expect(result.current.draft?.deliveries).toEqual(deliveries);
	});

	it("does not invent a draft when sending with none loaded", async () => {
		makeRequestWithData.mockResolvedValue({
			recap: RECAP,
			sent: 0,
			failed: 0,
			skipped: 0,
			deliveries: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.sendRecap("campaign-1", "recap-1");
		});

		expect(result.current.draft).toBeNull();
	});

	it("surfaces the server's message and returns null when a call fails", async () => {
		makeRequestWithData.mockRejectedValue(new Error("Recap already sent"));

		const { result } = renderHook(() => usePlayerRecaps());
		let returned: unknown;
		await act(async () => {
			returned = await result.current.sendRecap("campaign-1", "recap-1");
		});

		expect(returned).toBeNull();
		expect(result.current.error).toBe("Recap already sent");
		expect(result.current.loading).toBe(false);
	});

	it("falls back to a generic message when the failure is not an Error", async () => {
		makeRequestWithData.mockRejectedValue("kaboom");

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.fetchSettings("campaign-1");
		});

		expect(result.current.error).toBe("Something went wrong");
	});

	it("clears a stale error when the next call starts", async () => {
		makeRequestWithData.mockRejectedValueOnce(new Error("boom"));

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.fetchRecipients("campaign-1");
		});
		expect(result.current.error).toBe("boom");

		makeRequestWithData.mockResolvedValueOnce({ recipients: [] });
		await act(async () => {
			await result.current.fetchRecipients("campaign-1");
		});

		expect(result.current.error).toBeNull();
	});

	it("clears the draft so a reopened modal cannot show the previous session", async () => {
		makeRequestWithData.mockResolvedValue({
			recap: RECAP,
			safeRecap: null,
			spoilerFlags: [],
		});

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.generateDraft("campaign-1", "digest-1");
		});
		expect(result.current.draft).not.toBeNull();

		act(() => {
			result.current.clearDraft();
		});

		expect(result.current.draft).toBeNull();
	});

	it("exposes setError so callers can dismiss a banner", async () => {
		makeRequestWithData.mockRejectedValue(new Error("boom"));

		const { result } = renderHook(() => usePlayerRecaps());
		await act(async () => {
			await result.current.fetchSettings("campaign-1");
		});
		expect(result.current.error).toBe("boom");

		act(() => {
			result.current.setError(null);
		});

		expect(result.current.error).toBeNull();
	});
});
