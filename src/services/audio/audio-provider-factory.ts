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
 * Preference order per kind is "first-party if it can do the job, external
 * otherwise". The one nuance is `creature`: Workers AI can approximate a growl by
 * steering a low TTS voice, but a real sound model does it properly, so the
 * gateway provider wins that kind when configured.
 */

export interface AudioProviderEnv extends GatewayAudioEnv {
	AI?: WorkersAiBinding;
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
 * Speech kinds should prefer Workers AI (free-tier, first-party, no vendor);
 * sound and music kinds have no first-party option, so they take whatever
 * supports them.
 */
function preferenceFor(kind: AudioKind, providers: AudioProvider[]) {
	const supporting = providers.filter((p) => p.supports(kind));
	if (supporting.length === 0) return null;

	if (kind === "voice") {
		return supporting.find((p) => p.name === "workers-ai") ?? supporting[0];
	}
	return supporting[0];
}

export function resolveAudioProvider(
	env: AudioProviderEnv,
	kind: AudioKind
): AudioProvider {
	const provider = preferenceFor(kind, buildCandidates(env));
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
		const provider = preferenceFor(kind, providers);
		return {
			kind,
			available: provider !== null,
			provider: provider?.name ?? null,
			reason: provider ? null : UNAVAILABLE_REASON[kind],
		};
	});
}
