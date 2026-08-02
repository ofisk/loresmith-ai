import type { AudioKind } from "@/types/campaign-audio";
import { AUDIO_KINDS } from "@/types/campaign-audio";
import {
	AudioKindUnavailableError,
	type AudioProvider,
} from "./audio-provider";
import type { GatewayAudioEnv } from "./gateway-audio-provider";
import { createGatewayAudioProvider } from "./gateway-audio-provider";
import type { WorkersAiBinding } from "./workers-ai-tts-provider";
import { WorkersAiTtsProvider } from "./workers-ai-tts-provider";

/**
 * Selects an audio provider for a requested kind (issue #756).
 *
 * This deliberately inverts `llm-provider-factory.ts`. That factory routes on a
 * configured provider name, because every LLM provider can do every LLM job.
 * Audio providers cannot: Workers AI ships speech models and no sound or music
 * model at all, so the *capability* is what selects the provider, and a kind can
 * legitimately have no provider.
 *
 * Preference order is "external provider if configured, first-party otherwise".
 * An external key is only ever present because someone deliberately set it, and
 * a dedicated audio vendor beats a general TTS model on every kind it serves —
 * including `creature`, where Workers AI can only approximate a growl by
 * steering a low TTS voice. Workers AI remains the floor, so removing the key
 * degrades the feature to voice and creature rather than breaking it.
 */

export interface AudioProviderEnv extends GatewayAudioEnv {
	AI?: WorkersAiBinding;
	/**
	 * Pin `voice` to a specific provider. Only `workers-ai` is meaningful; it
	 * forces NPC dialogue onto the free first-party model. See `preferenceFor`.
	 */
	AUDIO_VOICE_PROVIDER?: string;
}

export interface AudioCapability {
	kind: AudioKind;
	available: boolean;
	provider: string | null;
	/** Shown to the GM when unavailable. Explains the platform gap, not an error. */
	reason: string | null;
}

const UNAVAILABLE_REASON: Record<AudioKind, string> = {
	voice:
		"Text-to-speech is unavailable because the Workers AI binding is not configured.",
	creature:
		"Creature sounds are unavailable because neither the Workers AI binding nor an external audio provider is configured.",
	ambience:
		"Scene ambience needs a sound-effect model. Cloudflare Workers AI does not offer one yet, and no external audio provider is configured for this environment.",
	sfx: "Sound effects need a sound-effect model. Cloudflare Workers AI does not offer one yet, and no external audio provider is configured for this environment.",
	music:
		"Theme music needs a music model. Cloudflare Workers AI does not offer one yet, and no external audio provider is configured for this environment.",
};

/**
 * Build the ordered candidate list for a kind. Order encodes preference; the
 * first provider that `supports()` the kind wins.
 */
function buildCandidates(env: AudioProviderEnv): AudioProvider[] {
	const candidates: AudioProvider[] = [];

	const gateway = createGatewayAudioProvider(env);
	if (gateway) candidates.push(gateway);

	if (env.AI) candidates.push(new WorkersAiTtsProvider(env.AI));

	return candidates;
}

/**
 * Pick the provider for a kind from the candidates that can serve it.
 *
 * `voice` is the only kind with a real choice, and the choice is a cost/quality
 * tradeoff rather than a capability one. Configuring an external provider is
 * taken as opting into it — a GM who supplied an ElevenLabs key wants ElevenLabs
 * voices, and a dedicated speech model is audibly better than steering a generic
 * TTS voice.
 *
 * That default is deliberately reversible, because voice is the one kind whose
 * volume is unbounded: ambience and music are generated a handful of times per
 * campaign, but NPC dialogue is per line, and it bills per character. Setting
 * `AUDIO_VOICE_PROVIDER=workers-ai` pins voice back to the free first-party
 * model while leaving ambience, effects, and music on the vendor.
 */
function preferenceFor(
	kind: AudioKind,
	providers: AudioProvider[],
	env: AudioProviderEnv
) {
	const supporting = providers.filter((p) => p.supports(kind));
	if (supporting.length === 0) return null;

	if (kind === "voice" && env.AUDIO_VOICE_PROVIDER === "workers-ai") {
		return supporting.find((p) => p.name === "workers-ai") ?? supporting[0];
	}
	return supporting[0];
}

export function resolveAudioProvider(
	env: AudioProviderEnv,
	kind: AudioKind
): AudioProvider {
	const provider = preferenceFor(kind, buildCandidates(env), env);
	if (!provider) {
		throw new AudioKindUnavailableError(kind, UNAVAILABLE_REASON[kind]);
	}
	return provider;
}

/**
 * Report what this environment can currently generate.
 *
 * Surfaced to the UI and to the agent so a GM is told "no music model exists
 * yet" up front, rather than after waiting on a generation that was never going
 * to succeed.
 */
export function describeAudioCapabilities(
	env: AudioProviderEnv
): AudioCapability[] {
	const providers = buildCandidates(env);

	return AUDIO_KINDS.map((kind) => {
		const provider = preferenceFor(kind, providers, env);
		return {
			kind,
			available: provider !== null,
			provider: provider?.name ?? null,
			reason: provider ? null : UNAVAILABLE_REASON[kind],
		};
	});
}
