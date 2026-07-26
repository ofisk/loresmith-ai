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
 * Scene ambience and campaign theme music, routed through Cloudflare AI Gateway
 * to an external audio model (issue #756).
 *
 * Why this exists at all: the Workers AI catalog has no text-to-music and no
 * text-to-sound-effect model, so these two kinds cannot be served first-party.
 * Going through AI Gateway rather than calling the vendor directly keeps caching,
 * rate limiting, logging, and cost visibility on Cloudflare — which matters more
 * for audio than for text, because a single generation costs orders of magnitude
 * more than a completion and identical scene prompts recur constantly across
 * campaigns ("tavern murmur", "rain on stone").
 *
 * This provider is INERT UNLESS CONFIGURED. Merging it commits the project to no
 * vendor and no spend: with `ELEVENLABS_API_KEY` unset, `createGatewayAudioProvider`
 * returns null, the factory reports ambience and music as unavailable, and the UI
 * explains why. Setting the secret is the deliberate act that turns it on.
 */

const SUPPORTED_KINDS: readonly AudioKind[] = ["ambience", "music", "creature"];

/**
 * ElevenLabs' sound-effects endpoint caps a single generation at 22 seconds.
 * Table use wants minutes, so the player loops a short bed client-side rather
 * than this provider attempting a long generation it cannot produce.
 */
export const MAX_SOUND_EFFECT_SEC = 22;

/** Default bed length: long enough that a loop is not obviously repetitive. */
export const DEFAULT_AMBIENCE_SEC = 20;

/** Music generations are longer-form; the endpoint accepts up to 5 minutes. */
export const MAX_MUSIC_SEC = 300;
export const DEFAULT_MUSIC_SEC = 60;

/** ElevenLabs returns 128 kbps MP3 by default. */
const ELEVENLABS_MP3_BITS_PER_SECOND = 128_000;

export interface GatewayAudioProviderConfig {
	apiKey: string;
	/** Full base URL to the vendor through AI Gateway, no trailing slash. */
	baseUrl: string;
	soundModel?: string;
	musicModel?: string;
}

/** Env keys this provider reads. All must be present for it to activate. */
export interface GatewayAudioEnv {
	ELEVENLABS_API_KEY?: string;
	AI_GATEWAY_ACCOUNT_ID?: string;
	AI_GATEWAY_ID?: string;
	/** Escape hatch for tests and for pointing at a different gateway/vendor. */
	AUDIO_GATEWAY_BASE_URL?: string;
}

export function buildGatewayBaseUrl(env: GatewayAudioEnv): string | null {
	if (env.AUDIO_GATEWAY_BASE_URL) {
		return env.AUDIO_GATEWAY_BASE_URL.replace(/\/+$/, "");
	}
	if (!env.AI_GATEWAY_ACCOUNT_ID || !env.AI_GATEWAY_ID) return null;
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/elevenlabs`;
}

/**
 * Build the provider, or return null when it is not configured.
 *
 * Returning null rather than throwing is deliberate: an unconfigured ambience
 * provider is the expected default state of this repository, not an error.
 */
export function createGatewayAudioProvider(
	env: GatewayAudioEnv
): GatewayAudioProvider | null {
	const apiKey = env.ELEVENLABS_API_KEY;
	if (!apiKey) return null;

	const baseUrl = buildGatewayBaseUrl(env);
	if (!baseUrl) return null;

	return new GatewayAudioProvider({ apiKey, baseUrl });
}

export class GatewayAudioProvider implements AudioProvider {
	readonly name = "ai-gateway:elevenlabs";

	private readonly soundModel: string;
	private readonly musicModel: string;

	constructor(private readonly config: GatewayAudioProviderConfig) {
		this.soundModel = config.soundModel ?? "eleven_text_to_sound_v2";
		this.musicModel = config.musicModel ?? "eleven_music_v1";
	}

	supports(kind: AudioKind): boolean {
		return SUPPORTED_KINDS.includes(kind);
	}

	async generate(request: AudioGenerationRequest): Promise<GeneratedAudio> {
		if (!this.supports(request.kind)) {
			throw new AudioGenerationError(
				this.name,
				`Gateway audio provider cannot generate ${request.kind} audio`
			);
		}

		const isMusic = request.kind === "music";
		const durationSec = this.clampDuration(request.kind, request.durationSec);
		const { path, body, model } = isMusic
			? {
					path: "/v1/music",
					model: this.musicModel,
					body: {
						prompt: request.prompt,
						music_length_ms: Math.round(durationSec * 1000),
						model_id: this.musicModel,
					},
				}
			: {
					path: "/v1/sound-generation",
					model: this.soundModel,
					body: {
						text: request.prompt,
						duration_seconds: durationSec,
						// Bias toward following the prompt over the model's own aesthetic;
						// a GM asking for "dripping water" wants dripping water.
						prompt_influence: 0.6,
						model_id: this.soundModel,
					},
				};

		const response = await this.post(path, body);
		const bytes = await toAudioBytes(response);

		if (bytes.byteLength === 0) {
			throw new AudioGenerationError(this.name, "Provider returned no audio");
		}

		return {
			bytes,
			contentType: "audio/mpeg",
			// The request duration is authoritative here — the vendor generates to
			// the requested length — but confirm against the encoded size so a
			// truncated response is not reported as a full-length track.
			durationSec:
				estimateDurationSec(bytes.byteLength, ELEVENLABS_MP3_BITS_PER_SECOND) ??
				durationSec,
			durationIsEstimate: true,
			model,
		};
	}

	private clampDuration(kind: AudioKind, requested?: number): number {
		if (kind === "music") {
			const value = requested ?? DEFAULT_MUSIC_SEC;
			return Math.min(Math.max(value, 10), MAX_MUSIC_SEC);
		}
		const value = requested ?? DEFAULT_AMBIENCE_SEC;
		return Math.min(Math.max(value, 1), MAX_SOUND_EFFECT_SEC);
	}

	private async post(
		path: string,
		body: Record<string, unknown>
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(`${this.config.baseUrl}${path}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"xi-api-key": this.config.apiKey,
					Accept: "audio/mpeg",
				},
				body: JSON.stringify(body),
			});
		} catch (error) {
			throw new AudioGenerationError(
				this.name,
				error instanceof Error ? error.message : "Gateway request failed"
			);
		}

		if (!response.ok) {
			// Read the body for the vendor's reason, but never surface it verbatim to
			// the GM — it can contain account and quota detail.
			const detail = await response.text().catch(() => "");
			throw new AudioGenerationError(
				this.name,
				`Audio provider returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
			);
		}

		return response;
	}
}
