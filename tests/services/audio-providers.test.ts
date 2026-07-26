import { describe, expect, it, vi } from "vitest";
import {
	AudioGenerationError,
	AudioKindUnavailableError,
	estimateDurationSec,
	toAudioBytes,
} from "@/services/audio/audio-provider";
import {
	describeAudioCapabilities,
	resolveAudioProvider,
} from "@/services/audio/audio-provider-factory";
import {
	buildGatewayBaseUrl,
	createGatewayAudioProvider,
	GatewayAudioProvider,
	MAX_SOUND_EFFECT_SEC,
} from "@/services/audio/gateway-audio-provider";
import { WorkersAiTtsProvider } from "@/services/audio/workers-ai-tts-provider";

/**
 * The provider layer for #756. The behaviour worth pinning is the capability
 * matrix: Workers AI has speech models and no sound or music model, so ambience
 * and music must report as unavailable rather than failing at generation time,
 * and that distinction has to survive future edits.
 */

function fakeAi(response: unknown) {
	return { run: vi.fn().mockResolvedValue(response) };
}

const MP3_BYTES = new Uint8Array(48_000).fill(7);

describe("toAudioBytes", () => {
	it("passes through raw bytes", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		expect(await toAudioBytes(bytes)).toBe(bytes);
	});

	it("unwraps an ArrayBuffer", async () => {
		const result = await toAudioBytes(new Uint8Array([1, 2, 3]).buffer);
		expect(Array.from(result)).toEqual([1, 2, 3]);
	});

	it("drains a ReadableStream, which is what Aura returns", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2]));
				controller.enqueue(new Uint8Array([3]));
				controller.close();
			},
		});

		expect(Array.from(await toAudioBytes(stream))).toEqual([1, 2, 3]);
	});

	it("decodes the base64 `{ audio }` shape, which is what MeloTTS returns", async () => {
		const result = await toAudioBytes({ audio: btoa("abc") });
		expect(new TextDecoder().decode(result)).toBe("abc");
	});

	it("rejects a shape it does not recognize instead of guessing", async () => {
		await expect(toAudioBytes({ nope: true })).rejects.toThrow(
			/unrecognized audio response/i
		);
	});
});

describe("estimateDurationSec", () => {
	it("derives seconds from encoded length at a known bitrate", () => {
		// 48 kB at 48 kbps is 8 seconds.
		expect(estimateDurationSec(48_000, 48_000)).toBe(8);
	});

	it("returns null rather than a bogus zero for empty input", () => {
		expect(estimateDurationSec(0, 48_000)).toBeNull();
	});
});

describe("WorkersAiTtsProvider", () => {
	it("serves the speech kinds and refuses the rest", () => {
		const provider = new WorkersAiTtsProvider(fakeAi(MP3_BYTES));

		expect(provider.supports("voice")).toBe(true);
		expect(provider.supports("creature")).toBe(true);
		expect(provider.supports("ambience")).toBe(false);
		expect(provider.supports("music")).toBe(false);
	});

	it("returns mp3 bytes and flags the duration as an estimate", async () => {
		const provider = new WorkersAiTtsProvider(fakeAi(MP3_BYTES));

		const result = await provider.generate({
			kind: "voice",
			prompt: "You should not have come back here.",
		});

		expect(result.contentType).toBe("audio/mpeg");
		expect(result.bytes.byteLength).toBe(48_000);
		// Aura reports no duration, so anything we give back is derived.
		expect(result.durationIsEstimate).toBe(true);
		expect(result.durationSec).toBeGreaterThan(0);
	});

	it("picks a lower-register speaker for creature than for voice", async () => {
		const ai = fakeAi(MP3_BYTES);
		const provider = new WorkersAiTtsProvider(ai);

		await provider.generate({ kind: "voice", prompt: "Hello." });
		await provider.generate({ kind: "creature", prompt: "A roar." });

		const [voiceCall, creatureCall] = ai.run.mock.calls;
		expect(voiceCall[1].speaker).not.toBe(creatureCall[1].speaker);
	});

	it("fails loudly when the model returns no audio", async () => {
		const provider = new WorkersAiTtsProvider(fakeAi(new Uint8Array()));

		await expect(
			provider.generate({ kind: "voice", prompt: "Hello." })
		).rejects.toThrow(AudioGenerationError);
	});

	it("rejects an empty prompt rather than paying for silence", async () => {
		const provider = new WorkersAiTtsProvider(fakeAi(MP3_BYTES));

		await expect(
			provider.generate({ kind: "voice", prompt: "   " })
		).rejects.toThrow(/empty/i);
	});
});

describe("buildGatewayBaseUrl", () => {
	it("builds the AI Gateway path from account and gateway ids", () => {
		expect(
			buildGatewayBaseUrl({
				AI_GATEWAY_ACCOUNT_ID: "acct",
				AI_GATEWAY_ID: "gw",
			})
		).toBe("https://gateway.ai.cloudflare.com/v1/acct/gw/elevenlabs");
	});

	it("returns null when the gateway is not configured", () => {
		expect(buildGatewayBaseUrl({})).toBeNull();
	});
});

describe("createGatewayAudioProvider", () => {
	it("is inert without an API key, which is this repo's default state", () => {
		expect(
			createGatewayAudioProvider({
				AI_GATEWAY_ACCOUNT_ID: "acct",
				AI_GATEWAY_ID: "gw",
			})
		).toBeNull();
	});

	it("is inert without a gateway, so no request bypasses AI Gateway", () => {
		expect(
			createGatewayAudioProvider({ ELEVENLABS_API_KEY: "key" })
		).toBeNull();
	});

	it("activates once both are present", () => {
		expect(
			createGatewayAudioProvider({
				ELEVENLABS_API_KEY: "key",
				AUDIO_GATEWAY_BASE_URL: "https://example.test/eleven",
			})
		).toBeInstanceOf(GatewayAudioProvider);
	});
});

describe("GatewayAudioProvider", () => {
	function stubFetch(body: Uint8Array, ok = true) {
		return vi.fn().mockResolvedValue(
			new Response(ok ? body : "quota exceeded", {
				status: ok ? 200 : 429,
			})
		);
	}

	it("clamps an ambience request to what the sound endpoint supports", async () => {
		const fetchMock = stubFetch(MP3_BYTES);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GatewayAudioProvider({
			apiKey: "key",
			baseUrl: "https://example.test/eleven",
		});

		// A GM asking for ten minutes cannot get it from a 22-second endpoint; the
		// player loops the bed instead.
		await provider.generate({
			kind: "ambience",
			prompt: "rain on stone",
			durationSec: 600,
		});

		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.duration_seconds).toBe(MAX_SOUND_EFFECT_SEC);

		vi.unstubAllGlobals();
	});

	it("routes music to the music endpoint, not the sound endpoint", async () => {
		const fetchMock = stubFetch(MP3_BYTES);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GatewayAudioProvider({
			apiKey: "key",
			baseUrl: "https://example.test/eleven",
		});

		await provider.generate({ kind: "music", prompt: "villain theme" });

		expect(fetchMock.mock.calls[0][0]).toContain("/v1/music");

		vi.unstubAllGlobals();
	});

	it("does not leak the vendor's quota detail verbatim in the thrown type", async () => {
		vi.stubGlobal("fetch", stubFetch(MP3_BYTES, false));

		const provider = new GatewayAudioProvider({
			apiKey: "key",
			baseUrl: "https://example.test/eleven",
		});

		await expect(
			provider.generate({ kind: "ambience", prompt: "rain" })
		).rejects.toThrow(AudioGenerationError);

		vi.unstubAllGlobals();
	});
});

describe("audio capability matrix", () => {
	it("reports ambience and music unavailable on Workers AI alone", () => {
		const capabilities = describeAudioCapabilities({ AI: fakeAi(MP3_BYTES) });
		const byKind = Object.fromEntries(capabilities.map((c) => [c.kind, c]));

		expect(byKind.voice.available).toBe(true);
		expect(byKind.creature.available).toBe(true);
		// This is the platform fact the whole abstraction exists for.
		expect(byKind.ambience.available).toBe(false);
		expect(byKind.music.available).toBe(false);
	});

	it("explains why an unavailable kind is unavailable", () => {
		const capabilities = describeAudioCapabilities({ AI: fakeAi(MP3_BYTES) });
		const music = capabilities.find((c) => c.kind === "music");

		expect(music?.reason).toMatch(/music model/i);
	});

	it("turns every kind on once a gateway provider is configured", () => {
		const capabilities = describeAudioCapabilities({
			AI: fakeAi(MP3_BYTES),
			ELEVENLABS_API_KEY: "key",
			AUDIO_GATEWAY_BASE_URL: "https://example.test/eleven",
		});

		expect(capabilities.every((c) => c.available)).toBe(true);
	});

	it("keeps voice on first-party Workers AI even when a vendor is configured", () => {
		const provider = resolveAudioProvider(
			{
				AI: fakeAi(MP3_BYTES),
				ELEVENLABS_API_KEY: "key",
				AUDIO_GATEWAY_BASE_URL: "https://example.test/eleven",
			},
			"voice"
		);

		expect(provider.name).toBe("workers-ai");
	});

	it("prefers a real sound model over coerced TTS for creature", () => {
		const provider = resolveAudioProvider(
			{
				AI: fakeAi(MP3_BYTES),
				ELEVENLABS_API_KEY: "key",
				AUDIO_GATEWAY_BASE_URL: "https://example.test/eleven",
			},
			"creature"
		);

		expect(provider.name).toBe("ai-gateway:elevenlabs");
	});

	it("throws a typed unavailability error, not a generic failure", () => {
		expect(() =>
			resolveAudioProvider({ AI: fakeAi(MP3_BYTES) }, "music")
		).toThrow(AudioKindUnavailableError);
	});

	it("reports nothing available when the environment has no bindings at all", () => {
		const capabilities = describeAudioCapabilities({});
		expect(capabilities.every((c) => !c.available)).toBe(true);
	});
});
