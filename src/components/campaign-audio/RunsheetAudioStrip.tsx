import { useEffect, useMemo, useState } from "react";
import { useCampaignAudio } from "@/hooks/useCampaignAudio";
import { AudioTrackRow } from "./AudioTrackRow";

interface RunsheetAudioStripProps {
	campaignId: string;
}

/**
 * Playable campaign audio, shown on the open runsheet (issues #756 and #742).
 *
 * The runsheet is where a GM's eyes already are mid-session, so it is where the
 * play button belongs — the alternative is hunting through a separate tab while
 * the table waits.
 *
 * Deliberately reads LIVE rather than being baked into the runsheet snapshot. A
 * runsheet is frozen so the plan cannot shift under the GM mid-session, but
 * audio is not plan: a track generated after the runsheet was made should still
 * be reachable from it, and a deleted track must not linger as a dead play
 * button.
 */
export function RunsheetAudioStrip({ campaignId }: RunsheetAudioStripProps) {
	const { tracks, fetchTracks, loadTrackBytes } = useCampaignAudio();
	const [nowPlaying, setNowPlaying] = useState<string | null>(null);

	useEffect(() => {
		void fetchTracks(campaignId);
	}, [campaignId, fetchTracks]);

	// Only finished tracks are worth a play button at the table.
	const playable = useMemo(
		() => tracks.filter((track) => track.status === "ready"),
		[tracks]
	);

	return (
		<section>
			<h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 pb-1 mb-2">
				Audio
			</h4>

			{playable.length === 0 ? (
				<p className="text-xs text-neutral-500 dark:text-neutral-400">
					No audio generated for this campaign yet.
				</p>
			) : (
				<div className="space-y-2">
					{playable.map((track) => (
						<AudioTrackRow
							key={track.id}
							track={track}
							loadTrackBytes={(audioId) => loadTrackBytes(campaignId, audioId)}
							onPlay={setNowPlaying}
							stopSignal={nowPlaying}
						/>
					))}
				</div>
			)}
		</section>
	);
}
