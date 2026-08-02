import { Info, MusicNotes } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCampaignAudio } from "@/hooks/useCampaignAudio";
import type { AudioKind, CampaignAudioRecord } from "@/types/campaign-audio";
import { AUDIO_KINDS } from "@/types/campaign-audio";
import { AudioTrackRow } from "./AudioTrackRow";

interface CampaignAudioPanelProps {
	campaignId: string;
	className?: string;
}

const KIND_LABEL: Record<AudioKind, string> = {
	ambience: "Scene ambience",
	sfx: "Sound effect",
	music: "Theme music",
	creature: "Creature sound",
	voice: "NPC voice",
};

const KIND_PLACEHOLDER: Record<AudioKind, string> = {
	ambience: "a flooded crypt, dripping water and distant chittering",
	sfx: "a heavy iron portcullis slamming shut",
	music: "the villain's theme — dread, low strings",
	creature: "a wet, throaty roar from something very large",
	voice: "Type the exact line the NPC should say",
};

/**
 * Campaign audio surface (issue #756): generate tracks, then play them at the
 * table.
 *
 * Capability is surfaced up front rather than discovered on failure. Ambience
 * and music have no provider unless one is configured — Workers AI has no sound
 * or music model — so the form disables those kinds and says why, instead of
 * accepting a request that can only fail a minute later.
 */
export function CampaignAudioPanel({
	campaignId,
	className = "",
}: CampaignAudioPanelProps) {
	const {
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
	} = useCampaignAudio();

	const [kind, setKind] = useState<AudioKind>("ambience");
	const [hint, setHint] = useState("");
	const [nowPlaying, setNowPlaying] = useState<string | null>(null);

	useEffect(() => {
		void fetchTracks(campaignId);
		void fetchCapabilities(campaignId);
	}, [campaignId, fetchTracks, fetchCapabilities]);

	const capabilityFor = useCallback(
		(target: AudioKind) => capabilities.find((c) => c.kind === target),
		[capabilities]
	);

	const selectedCapability = capabilityFor(kind);
	// Before capabilities load there is nothing to disable on, so allow the form.
	const canGenerate = selectedCapability?.available ?? true;

	const unavailableKinds = useMemo(
		() => capabilities.filter((c) => !c.available),
		[capabilities]
	);

	const handleGenerate = useCallback(async () => {
		if (!hint.trim()) return;
		const input =
			kind === "voice"
				? { kind, line: hint.trim() }
				: { kind, hint: hint.trim() };
		const created = await generate(campaignId, input);
		if (created) setHint("");
	}, [campaignId, generate, hint, kind]);

	const handleDelete = useCallback(
		(track: CampaignAudioRecord) => {
			void deleteTrack(campaignId, track.id);
		},
		[campaignId, deleteTrack]
	);

	const handleToggleLoop = useCallback(
		(track: CampaignAudioRecord, loopable: boolean) => {
			void updateTrack(campaignId, track.id, { loopable });
		},
		[campaignId, updateTrack]
	);

	const handleLoadBytes = useCallback(
		(audioId: string) => loadTrackBytes(campaignId, audioId),
		[campaignId, loadTrackBytes]
	);

	return (
		<div className={`space-y-4 ${className}`}>
			<div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg space-y-3">
				<div className="flex items-center gap-2">
					<MusicNotes size={18} className="text-neutral-500" />
					<h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
						Generate audio
					</h2>
				</div>

				<div className="flex flex-wrap gap-2">
					{AUDIO_KINDS.map((option) => {
						const capability = capabilityFor(option);
						const disabled = capability ? !capability.available : false;
						return (
							<button
								key={option}
								type="button"
								disabled={disabled}
								onClick={() => setKind(option)}
								title={capability?.reason ?? undefined}
								className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
									kind === option
										? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
										: "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
								} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
							>
								{KIND_LABEL[option]}
							</button>
						);
					})}
				</div>

				<textarea
					value={hint}
					onChange={(e) => setHint(e.target.value)}
					rows={2}
					placeholder={KIND_PLACEHOLDER[kind]}
					aria-label={KIND_LABEL[kind]}
					className="w-full p-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100"
				/>

				{!canGenerate && selectedCapability?.reason && (
					<div className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
						<Info size={14} className="shrink-0 mt-0.5" />
						<p>{selectedCapability.reason}</p>
					</div>
				)}

				<div className="flex items-center justify-between gap-3">
					<p className="text-xs text-neutral-500 dark:text-neutral-400">
						Generation takes up to a minute. You'll be notified when it's ready.
					</p>
					<button
						type="button"
						onClick={handleGenerate}
						disabled={loading || !canGenerate || !hint.trim()}
						className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
					>
						Generate
					</button>
				</div>
			</div>

			{unavailableKinds.length > 0 && (
				<div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
					{unavailableKinds.map((capability) => (
						<p key={capability.kind}>
							<span className="font-medium">
								{KIND_LABEL[capability.kind]}:
							</span>{" "}
							{capability.reason}
						</p>
					))}
				</div>
			)}

			{error && (
				<p className="text-sm text-red-500 dark:text-red-400">{error}</p>
			)}

			{tracks.length === 0 ? (
				<div className="p-8 text-center">
					<div className="text-neutral-500 dark:text-neutral-400 mb-2">
						No audio yet
					</div>
					<p className="text-sm text-neutral-400">
						Generate ambience for a scene, or a theme for your campaign.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{tracks.map((track) => (
						<AudioTrackRow
							key={track.id}
							track={track}
							loadTrackBytes={handleLoadBytes}
							onDelete={handleDelete}
							onToggleLoop={handleToggleLoop}
							onPlay={setNowPlaying}
							stopSignal={nowPlaying}
						/>
					))}
				</div>
			)}
		</div>
	);
}
