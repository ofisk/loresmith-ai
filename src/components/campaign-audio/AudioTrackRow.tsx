import {
	ArrowsClockwise,
	Pause,
	Play,
	SpeakerHigh,
	Trash,
	Warning,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoopPlayer } from "@/lib/audio/loop-player";
import type { CampaignAudioRecord } from "@/types/campaign-audio";

interface AudioTrackRowProps {
	track: CampaignAudioRecord;
	/** Fetches the encoded bytes through the authenticated stream route. */
	loadTrackBytes: (audioId: string) => Promise<ArrayBuffer | null>;
	onDelete?: (track: CampaignAudioRecord) => void;
	onToggleLoop?: (track: CampaignAudioRecord, loopable: boolean) => void;
	/** Told when this row starts playing, so the panel can stop the others. */
	onPlay?: (audioId: string) => void;
	/** Set when another row took over playback. */
	stopSignal?: string | null;
}

function formatDuration(seconds: number | null): string {
	if (!seconds || seconds <= 0) return "--:--";
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const KIND_LABEL: Record<string, string> = {
	ambience: "Ambience",
	sfx: "Effect",
	music: "Music",
	creature: "Creature",
	voice: "Voice",
};

/**
 * One generated track, with playback.
 *
 * Playback goes through `LoopPlayer` (Web Audio) rather than an `<audio>`
 * element because looping a twenty-second ambience bed with an `<audio loop>`
 * leaves an audible gap at every wrap. See `src/lib/audio/loop-player.ts`.
 */
export function AudioTrackRow({
	track,
	loadTrackBytes,
	onDelete,
	onToggleLoop,
	onPlay,
	stopSignal,
}: AudioTrackRowProps) {
	const playerRef = useRef<LoopPlayer | null>(null);
	const [playing, setPlaying] = useState(false);
	const [buffering, setBuffering] = useState(false);
	const [volume, setVolume] = useState(0.8);
	const [playbackError, setPlaybackError] = useState<string | null>(null);

	// Tear the audio context down with the row; leaking one per track would keep
	// the browser's audio hardware open for the life of the page.
	useEffect(() => {
		return () => {
			void playerRef.current?.close();
			playerRef.current = null;
		};
	}, []);

	// Only one track plays at a time; the panel signals the others to stop.
	useEffect(() => {
		if (stopSignal && stopSignal !== track.id && playing) {
			playerRef.current?.stop();
			setPlaying(false);
		}
	}, [stopSignal, track.id, playing]);

	const handleStop = useCallback(() => {
		playerRef.current?.stop();
		setPlaying(false);
	}, []);

	const handlePlay = useCallback(async () => {
		setPlaybackError(null);
		setBuffering(true);
		try {
			if (!playerRef.current) {
				const bytes = await loadTrackBytes(track.id);
				if (!bytes) {
					setPlaybackError("Could not load this track.");
					return;
				}
				const player = new LoopPlayer();
				await player.load(bytes);
				playerRef.current = player;
			}
			playerRef.current.setVolume(volume);
			await playerRef.current.play(track.loopable);
			setPlaying(true);
			onPlay?.(track.id);
		} catch {
			setPlaybackError("Playback failed in this browser.");
		} finally {
			setBuffering(false);
		}
	}, [loadTrackBytes, track.id, track.loopable, volume, onPlay]);

	const handleVolume = useCallback((next: number) => {
		setVolume(next);
		playerRef.current?.setVolume(next);
	}, []);

	const isReady = track.status === "ready";

	return (
		<div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
			<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2 mb-1">
						<h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
							{track.title}
						</h3>
						<span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
							{KIND_LABEL[track.kind] ?? track.kind}
						</span>
						{track.status === "pending" && (
							<span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
								<ArrowsClockwise className="animate-spin" size={12} />
								Generating…
							</span>
						)}
						{track.status === "failed" && (
							<span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
								<Warning size={12} />
								Failed
							</span>
						)}
					</div>

					{track.description && (
						<p className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">
							{track.description}
						</p>
					)}

					<div className="text-xs text-neutral-500 dark:text-neutral-400">
						{formatDuration(track.durationSec)}
						{track.source?.label && <span> • {track.source.label}</span>}
						{track.loopable && <span> • loops</span>}
					</div>

					{track.status === "failed" && track.errorMessage && (
						<p className="mt-2 text-xs text-red-500 dark:text-red-400">
							{track.errorMessage}
						</p>
					)}
					{playbackError && (
						<p className="mt-2 text-xs text-red-500 dark:text-red-400">
							{playbackError}
						</p>
					)}
				</div>

				<div className="flex items-center gap-2 self-end sm:self-auto">
					{isReady && (
						<>
							<button
								type="button"
								onClick={playing ? handleStop : handlePlay}
								disabled={buffering}
								aria-label={playing ? "Pause" : "Play"}
								className="p-2 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
							>
								{playing ? <Pause size={18} /> : <Play size={18} />}
							</button>

							<label className="flex items-center gap-1 text-neutral-500">
								<SpeakerHigh size={16} />
								<span className="sr-only">Volume</span>
								<input
									type="range"
									min={0}
									max={1}
									step={0.05}
									value={volume}
									onChange={(e) => handleVolume(Number(e.target.value))}
									className="w-20"
								/>
							</label>

							{onToggleLoop && (
								<button
									type="button"
									onClick={() => onToggleLoop(track, !track.loopable)}
									aria-label={track.loopable ? "Disable loop" : "Enable loop"}
									className={`p-2 transition-colors ${
										track.loopable
											? "text-blue-600 dark:text-blue-400"
											: "text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400"
									}`}
								>
									<ArrowsClockwise size={18} />
								</button>
							)}
						</>
					)}

					{onDelete && (
						<button
							type="button"
							onClick={() => onDelete(track)}
							aria-label="Delete track"
							className="p-2 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
						>
							<Trash size={18} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
