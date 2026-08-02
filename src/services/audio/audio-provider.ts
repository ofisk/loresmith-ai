import type { AudioKind } from "@/types/campaign-audio";

/**
 * Provider abstraction for generated audio (issue #756), mirroring the shape of
 * `src/services/llm/llm-provider.ts`.
 *
 * The abstraction exists for a specific, known-imminent reason rather than as
 * speculative generality: Workers AI has speech models but no text-to-music or
 * text-to-sound-effect model, so ambience and music must currently leave
 * Cloudflare's first-party catalog. When a Workers AI music model ships, adding
 * it should mean writing one class and one factory branch, with no caller
 * changes anywhere.
 */

export interface AudioGenerationRequest {
	kind: AudioKind;
	/** Fully-built prompt. Prompt construction is the service's job, not the provider's. */
	prompt: string;
	/** Requested length. Providers clamp to what their model supports. */
	durationSec?: number;
	/** Provider-specific voice/speaker id, for the speech kinds. */
	voice?: string;
	/**
	 * Ask the model to render a bed that wraps seamlessly.
	 *
	 * A hint, not a guarantee — providers that cannot do it ignore it, and
	 * playback still crossfades. Worth asking for anyway: a model that renders the
	 * loop point itself beats any amount of fading at the seam.
	 */
	loop?: boolean;
	/** For `music`: suppress vocals. Defaults to instrumental for table use. */
	instrumental?: boolean;
}

export interface GeneratedAudio {
	bytes: Uint8Array;
	contentType: string;
	/**
	 * Length of the generated audio in seconds, or null when the provider cannot
	 * report it. Load-bearing for cost accounting: audio is priced per second of
	 * output, not per token.
	 */
	durationSec: number | null;
	/**
	 * True when `durationSec` was derived from byte length rather than reported by
	 * the provider. Kept explicit so spend logs never present an estimate as exact.
	 */
	durationIsEstimate: boolean;
	model: string;
}

export interface AudioProvider {
	/** Stable identifier persisted on the row and used in spend logs. */
	readonly name: string;

	/** Whether this provider can serve the given kind. */
	supports(kind: AudioKind): boolean;

	generate(request: AudioGenerationRequest): Promise<GeneratedAudio>;
}

/**
 * Raised when no configured provider can serve a kind.
 *
 * Distinct from a generation failure because it is a permanent, explainable
 * state — "Cloudflare has no music model and no external provider is configured"
 * — and the UI should say so plainly instead of offering a retry that can only
 * fail the same way.
 */
export class AudioKindUnavailableError extends Error {
	readonly kind: AudioKind;

	constructor(kind: AudioKind, detail: string) {
		super(detail);
		this.name = "AudioKindUnavailableError";
		this.kind = kind;
	}
}

/** Raised when a provider was reachable but the generation call failed. */
export class AudioGenerationError extends Error {
	readonly provider: string;

	constructor(provider: string, message: string) {
		super(message);
		this.name = "AudioGenerationError";
		this.provider = provider;
	}
}

/**
 * Estimate playback seconds from encoded byte length at a known constant bitrate.
 *
 * Only valid for CBR formats (the MP3s these providers emit). Callers must set
 * `durationIsEstimate` when using this.
 */
export function estimateDurationSec(
	byteLength: number,
	bitsPerSecond: number
): number | null {
	if (byteLength <= 0 || bitsPerSecond <= 0) return null;
	return Number(((byteLength * 8) / bitsPerSecond).toFixed(2));
}

/**
 * Normalize the several shapes a Workers AI / HTTP audio response can take into
 * raw bytes.
 *
 * Workers AI is not consistent here: `@cf/deepgram/aura-1` resolves to a
 * ReadableStream of audio bytes, while `@cf/myshell-ai/melotts` resolves to
 * `{ audio: "<base64>" }`. Both shapes are handled so swapping the model does not
 * mean rewriting the provider.
 */
export async function toAudioBytes(response: unknown): Promise<Uint8Array> {
	if (response instanceof Uint8Array) return response;
	if (response instanceof ArrayBuffer) return new Uint8Array(response);

	if (response instanceof ReadableStream) {
		return await readStreamFully(response);
	}

	if (response instanceof Response) {
		const buffer = await response.arrayBuffer();
		return new Uint8Array(buffer);
	}

	if (response && typeof response === "object" && "audio" in response) {
		const audio = (response as { audio: unknown }).audio;
		if (typeof audio === "string") return base64ToBytes(audio);
		if (audio instanceof ArrayBuffer) return new Uint8Array(audio);
		if (audio instanceof Uint8Array) return audio;
	}

	throw new Error("Provider returned an unrecognized audio response shape");
}

async function readStreamFully(
	stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
