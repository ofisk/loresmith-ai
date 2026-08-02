import type { AudioKind } from "@/types/campaign-audio";
import {
	AudioGenerationError,
	type AudioGenerationRequest,
	type AudioProvider,
	estimateDurationSec,
	type GeneratedAudio,
	toAudioBytes,
} from "./audio-provider";

/**
 * Workers AI text-to-speech, covering the `voice` and `creature` kinds.
 *
 * This is the half of #756 that is buildable on Cloudflare's first-party catalog
 * today, with no new vendor: Deepgram Aura is in the Workers AI catalog and is
 * reached through the existing `AI` binding.
 *
 * `creature` is served here with an explicit caveat. Aura is a *voice* model, not
 * a sound-effect model, so a dragon's roar is approximated by steering a low
 * voice through onomatopoeia rather than synthesized as a sound. It is good
 * enough for a whispered Deep Speech threat or a hissing NPC and noticeably not
 * good enough for a wet, throaty roar. A real sound model routed through
 * `GatewayAudioProvider` supersedes this path for `creature` when configured.
 */

export const WORKERS_AI_TTS_MODEL = "@cf/deepgram/aura-1";

/** Aura's default MP3 output is 48 kbps mono, which is what the estimate assumes. */
const AURA_MP3_BITS_PER_SECOND = 48_000;

/**
 * Aura speaker ids chosen for table use. `creature` deliberately picks the
 * lowest-register voice available, which is the only lever a speech model gives
 * us over timbre.
 */
const DEFAULT_SPEAKER_BY_KIND: Partial<Record<AudioKind, string>> = {
	voice: "angus",
	creature: "zeus",
};

const SUPPORTED_KINDS: readonly AudioKind[] = ["voice", "creature"];

/** Aura rejects very long inputs; keep requests inside a safe single-call bound. */
const MAX_PROMPT_CHARS = 1800;

export interface WorkersAiTtsProviderOptions {
	model?: string;
}

/** The slice of the Workers AI binding this provider needs. */
export interface WorkersAiBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export class WorkersAiTtsProvider implements AudioProvider {
	readonly name = "workers-ai";

	private readonly model: string;

	constructor(
		private readonly ai: WorkersAiBinding,
		options: WorkersAiTtsProviderOptions = {}
	) {
		this.model = options.model ?? WORKERS_AI_TTS_MODEL;
	}

	supports(kind: AudioKind): boolean {
		return SUPPORTED_KINDS.includes(kind);
	}

	async generate(request: AudioGenerationRequest): Promise<GeneratedAudio> {
		if (!this.supports(request.kind)) {
			throw new AudioGenerationError(
				this.name,
				`Workers AI TTS cannot generate ${request.kind} audio`
			);
		}

		const text = request.prompt.trim().slice(0, MAX_PROMPT_CHARS);
		if (!text) {
			throw new AudioGenerationError(this.name, "Prompt is empty");
		}

		const speaker =
			request.voice ?? DEFAULT_SPEAKER_BY_KIND[request.kind] ?? "angus";

		let response: unknown;
		try {
			response = await this.ai.run(this.model, {
				text,
				speaker,
				encoding: "mp3",
			});
		} catch (error) {
			throw new AudioGenerationError(
				this.name,
				error instanceof Error ? error.message : "Workers AI call failed"
			);
		}

		let bytes: Uint8Array;
		try {
			bytes = await toAudioBytes(response);
		} catch (error) {
			throw new AudioGenerationError(
				this.name,
				error instanceof Error ? error.message : "Unreadable audio response"
			);
		}

		if (bytes.byteLength === 0) {
			throw new AudioGenerationError(this.name, "Provider returned no audio");
		}

		return {
			bytes,
			contentType: "audio/mpeg",
			// Aura reports no duration, so this is derived from the encoded length.
			durationSec: estimateDurationSec(
				bytes.byteLength,
				AURA_MP3_BITS_PER_SECOND
			),
			durationIsEstimate: true,
			model: this.model,
		};
	}
}
