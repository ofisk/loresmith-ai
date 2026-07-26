import { useCallback, useState } from "react";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { AudioKind, CampaignAudioRecord } from "@/types/campaign-audio";

export interface AudioCapability {
	kind: AudioKind;
	available: boolean;
	provider: string | null;
	reason: string | null;
}

export interface GenerateAudioInput {
	kind: AudioKind;
	hint?: string;
	entityId?: string;
	scene?: string;
	line?: string;
	durationSec?: number;
	title?: string;
}

/**
 * Campaign audio operations for the GM surface (issue #756).
 *
 * Two things here are shaped by the backend rather than by preference:
 *
 * 1. `generate` resolves on 202, not on a finished track. Generation takes
 *    seconds to a minute, so the returned record is `pending` and the UI learns
 *    it is ready from a notification or a later `refresh`.
 * 2. `loadTrackBytes` returns raw bytes rather than a URL, because playback
 *    decodes through Web Audio to loop seamlessly, and because an `<audio src>`
 *    could not carry the Authorization header the stream route requires.
 */
export function useCampaignAudio() {
	const { makeRequest, makeRequestWithData } = useAuthenticatedRequest();

	const [tracks, setTracks] = useState<CampaignAudioRecord[]>([]);
	const [capabilities, setCapabilities] = useState<AudioCapability[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = useCallback(
		async <T>(op: () => Promise<T>): Promise<T | null> => {
			setLoading(true);
			setError(null);
			try {
				return await op();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
				return null;
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	const fetchTracks = useCallback(
		(campaignId: string) =>
			run(async () => {
				const data = await makeRequestWithData<{
					audio: CampaignAudioRecord[];
				}>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.BASE(campaignId)
					)
				);
				setTracks(data.audio);
				return data.audio;
			}),
		[makeRequestWithData, run]
	);

	const fetchCapabilities = useCallback(
		(campaignId: string) =>
			run(async () => {
				const data = await makeRequestWithData<{
					capabilities: AudioCapability[];
				}>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.CAPABILITIES(campaignId)
					)
				);
				setCapabilities(data.capabilities);
				return data.capabilities;
			}),
		[makeRequestWithData, run]
	);

	/** Starts a generation; resolves with the `pending` record, not a finished track. */
	const generate = useCallback(
		(campaignId: string, input: GenerateAudioInput) =>
			run(async () => {
				const data = await makeRequestWithData<{ audio: CampaignAudioRecord }>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.BASE(campaignId)
					),
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(input),
					}
				);
				setTracks((prev) => [data.audio, ...prev]);
				return data.audio;
			}),
		[makeRequestWithData, run]
	);

	const updateTrack = useCallback(
		(
			campaignId: string,
			audioId: string,
			patch: { title?: string; description?: string | null; loopable?: boolean }
		) =>
			run(async () => {
				const data = await makeRequestWithData<{ audio: CampaignAudioRecord }>(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.DETAILS(campaignId, audioId)
					),
					{
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(patch),
					}
				);
				setTracks((prev) =>
					prev.map((t) => (t.id === audioId ? data.audio : t))
				);
				return data.audio;
			}),
		[makeRequestWithData, run]
	);

	const deleteTrack = useCallback(
		(campaignId: string, audioId: string) =>
			run(async () => {
				await makeRequestWithData(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.DETAILS(campaignId, audioId)
					),
					{ method: "DELETE" }
				);
				setTracks((prev) => prev.filter((t) => t.id !== audioId));
				return true;
			}),
		[makeRequestWithData, run]
	);

	/**
	 * Fetch the encoded audio bytes for playback.
	 *
	 * Returns an ArrayBuffer rather than a URL because playback decodes through
	 * Web Audio, not an `<audio src>` — see `src/lib/audio/loop-player.ts`. That
	 * also sidesteps the fact that an `<audio>` element cannot send an
	 * Authorization header, and the stream route is deliberately not public.
	 *
	 * Deliberately not wrapped in `run`: a playback failure belongs next to its
	 * track, not in the page-level error banner, and buffering one track must not
	 * flip the shared loading flag.
	 */
	const loadTrackBytes = useCallback(
		async (
			campaignId: string,
			audioId: string
		): Promise<ArrayBuffer | null> => {
			const response = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.AUDIO.STREAM(campaignId, audioId)
				)
			);
			if (!response.ok) return null;
			return await response.arrayBuffer();
		},
		[makeRequest]
	);

	return {
		tracks,
		capabilities,
		loading,
		error,
		fetchTracks,
		fetchCapabilities,
		generate,
		updateTrack,
		deleteTrack,
		loadTrackBytes,
	};
}
