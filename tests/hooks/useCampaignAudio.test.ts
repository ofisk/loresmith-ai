// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const makeRequestWithData = vi.fn();
const makeRequest = vi.fn();

vi.mock("@/hooks/useAuthenticatedRequest", () => ({
	useAuthenticatedRequest: () => ({ makeRequest, makeRequestWithData }),
}));

const { useCampaignAudio } = await import("@/hooks/useCampaignAudio");

const TRACK = {
	id: "audio-1",
	campaignId: "campaign-1",
	kind: "ambience" as const,
	title: "Ambience: The Weeping Crypt",
	description: null,
	prompt: "dripping water",
	r2Key: "campaigns/campaign-1/audio/audio-1.mp3",
	contentType: "audio/mpeg",
	durationSec: 20,
	sizeBytes: 320_000,
	provider: "ai-gateway:elevenlabs",
	model: "eleven_text_to_sound_v2",
	status: "ready" as const,
	errorMessage: null,
	loopable: true,
	source: null,
	createdBy: "gm",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

function lastUrl(): string {
	return makeRequestWithData.mock.calls.at(-1)?.[0] as string;
}

function lastInit(): RequestInit | undefined {
	return makeRequestWithData.mock.calls.at(-1)?.[1] as RequestInit | undefined;
}

beforeEach(() => {
	makeRequestWithData.mockReset();
	makeRequest.mockReset();
});

describe("useCampaignAudio", () => {
	it("starts empty with no error", () => {
		const { result } = renderHook(() => useCampaignAudio());

		expect(result.current.tracks).toEqual([]);
		expect(result.current.capabilities).toEqual([]);
		expect(result.current.error).toBeNull();
	});

	it("loads a campaign's tracks", async () => {
		makeRequestWithData.mockResolvedValue({ audio: [TRACK] });
		const { result } = renderHook(() => useCampaignAudio());

		await act(async () => {
			await result.current.fetchTracks("campaign-1");
		});

		expect(result.current.tracks).toEqual([TRACK]);
		expect(lastUrl()).toContain("/campaigns/campaign-1/audio");
	});

	it("loads capabilities so the UI can disable impossible kinds", async () => {
		const capabilities = [
			{ kind: "music", available: false, provider: null, reason: "No model" },
		];
		makeRequestWithData.mockResolvedValue({ capabilities });
		const { result } = renderHook(() => useCampaignAudio());

		await act(async () => {
			await result.current.fetchCapabilities("campaign-1");
		});

		expect(result.current.capabilities).toEqual(capabilities);
		expect(lastUrl()).toContain("/audio/capabilities");
	});

	it("adds the pending record returned by a 202 to the top of the list", async () => {
		const pending = { ...TRACK, id: "audio-2", status: "pending" as const };
		makeRequestWithData.mockResolvedValue({ audio: pending });
		const { result } = renderHook(() => useCampaignAudio());

		await act(async () => {
			await result.current.generate("campaign-1", {
				kind: "ambience",
				hint: "rain on stone",
			});
		});

		// Generation is async: the hook must not pretend the track is ready.
		expect(result.current.tracks[0].status).toBe("pending");
		expect(lastInit()?.method).toBe("POST");
	});

	it("replaces the edited track in place on update", async () => {
		makeRequestWithData.mockResolvedValueOnce({ audio: [TRACK] });
		const { result } = renderHook(() => useCampaignAudio());
		await act(async () => {
			await result.current.fetchTracks("campaign-1");
		});

		makeRequestWithData.mockResolvedValueOnce({
			audio: { ...TRACK, title: "Crypt bed" },
		});
		await act(async () => {
			await result.current.updateTrack("campaign-1", "audio-1", {
				title: "Crypt bed",
			});
		});

		expect(result.current.tracks).toHaveLength(1);
		expect(result.current.tracks[0].title).toBe("Crypt bed");
		expect(lastInit()?.method).toBe("PATCH");
	});

	it("drops the deleted track from the list", async () => {
		makeRequestWithData.mockResolvedValueOnce({ audio: [TRACK] });
		const { result } = renderHook(() => useCampaignAudio());
		await act(async () => {
			await result.current.fetchTracks("campaign-1");
		});

		makeRequestWithData.mockResolvedValueOnce({ success: true });
		await act(async () => {
			await result.current.deleteTrack("campaign-1", "audio-1");
		});

		expect(result.current.tracks).toEqual([]);
		expect(lastInit()?.method).toBe("DELETE");
	});

	it("surfaces a failure as an error rather than throwing at the caller", async () => {
		makeRequestWithData.mockRejectedValue(new Error("Access denied"));
		const { result } = renderHook(() => useCampaignAudio());

		let returned: unknown;
		await act(async () => {
			returned = await result.current.fetchTracks("campaign-1");
		});

		expect(returned).toBeNull();
		expect(result.current.error).toBe("Access denied");
		expect(result.current.loading).toBe(false);
	});

	it("returns encoded bytes for playback", async () => {
		const bytes = new Uint8Array([1, 2, 3]).buffer;
		makeRequest.mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
		const { result } = renderHook(() => useCampaignAudio());

		const loaded = await result.current.loadTrackBytes("campaign-1", "audio-1");

		expect(loaded).toBe(bytes);
		expect(makeRequest.mock.calls[0][0]).toContain("/audio/audio-1/stream");
	});

	it("returns null for an unplayable track without setting the page error", async () => {
		makeRequest.mockResolvedValue({ ok: false });
		const { result } = renderHook(() => useCampaignAudio());

		const loaded = await result.current.loadTrackBytes("campaign-1", "audio-1");

		expect(loaded).toBeNull();
		// A playback failure belongs next to its track, not in the page banner.
		expect(result.current.error).toBeNull();
	});
});
