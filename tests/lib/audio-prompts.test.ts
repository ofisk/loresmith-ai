import { describe, expect, it } from "vitest";
import {
	type AudioCampaignContext,
	buildAudioPrompt,
	buildAudioTitle,
} from "@/lib/prompts/audio-prompts";

/**
 * The prompt builder is the differentiator in #756 — generating audio inside
 * LoreSmith is only worth doing if the prompt comes from campaign context rather
 * than from the GM retyping their own world.
 *
 * The rules worth pinning are the ones that are easy to break by "improving" the
 * prompts later: ambience must never invite music or speech into a bed meant to
 * loop under a talking GM, and a voice prompt must be the literal line, because
 * a TTS model reads aloud anything appended to it.
 */

const CAMPAIGN: AudioCampaignContext = {
	name: "The Drowned Crown",
	description: "A grim campaign in flooded crypts beneath a sunken city.",
	tone: "grim, waterlogged",
};

describe("buildAudioPrompt", () => {
	/**
	 * Effects and ambience share a vendor endpoint, so the only thing keeping a
	 * door slam from coming back as a five-second wash is that they build
	 * opposite prompts. That opposition is the behaviour worth pinning.
	 */
	describe("sfx", () => {
		it("asks for a transient one-shot, not a bed", () => {
			const prompt = buildAudioPrompt({
				kind: "sfx",
				campaign: CAMPAIGN,
				hint: "an iron portcullis slamming shut",
			});

			expect(prompt).toContain("an iron portcullis slamming shut");
			expect(prompt).toContain("sharp transient");
			expect(prompt).toContain("no continuous background ambience");
		});

		it("does not ask for the loopable steadiness ambience wants", () => {
			const sfx = buildAudioPrompt({
				kind: "sfx",
				campaign: CAMPAIGN,
				hint: "a sword striking a shield",
			});
			const ambience = buildAudioPrompt({
				kind: "ambience",
				campaign: CAMPAIGN,
				hint: "a battlefield",
			});

			expect(ambience).toContain("loopable");
			expect(sfx).not.toContain("loopable");
		});
	});

	describe("ambience", () => {
		it("mines audible detail out of campaign and entity prose", () => {
			const prompt = buildAudioPrompt({
				kind: "ambience",
				campaign: CAMPAIGN,
				entity: {
					name: "The Weeping Crypt",
					entityType: "location",
					description: "A flooded tomb where water pools between the biers.",
				},
			});

			expect(prompt).toContain("dripping and trickling water");
			expect(prompt).toContain("deep stone echo");
		});

		it("forbids music and speech, which would ruin a loopable bed", () => {
			const prompt = buildAudioPrompt({
				kind: "ambience",
				campaign: CAMPAIGN,
				hint: "a busy tavern",
			});

			expect(prompt).toContain("no music");
			expect(prompt).toContain("no speech");
			expect(prompt).toContain("loopable");
		});

		it("uses the GM's own hint as the subject over derived context", () => {
			const prompt = buildAudioPrompt({
				kind: "ambience",
				campaign: CAMPAIGN,
				entity: {
					name: "The Weeping Crypt",
					entityType: "location",
					description: null,
				},
				hint: "howling wind over a frozen lake",
			});

			expect(prompt).toContain("howling wind over a frozen lake");
		});

		it("still produces a usable prompt when nothing audible is recognized", () => {
			const prompt = buildAudioPrompt({
				kind: "ambience",
				campaign: { name: "Untitled", description: null, tone: null },
			});

			expect(prompt).toContain("Untitled");
			expect(prompt).toContain("loopable");
		});
	});

	describe("music", () => {
		it("asks for a repeating motif, which is the thing GMs actually want", () => {
			const prompt = buildAudioPrompt({
				kind: "music",
				campaign: CAMPAIGN,
				hint: "the Betrayer's theme",
			});

			expect(prompt).toContain("motif");
			expect(prompt).toContain("no vocals");
		});

		it("translates campaign tone into instrumentation a model can act on", () => {
			const prompt = buildAudioPrompt({
				kind: "music",
				campaign: { ...CAMPAIGN, tone: "grim and dreadful" },
			});

			expect(prompt).toContain("dark, ominous, low strings");
		});

		it("falls back to a neutral character when no tone words match", () => {
			const prompt = buildAudioPrompt({
				kind: "music",
				campaign: { name: "Untitled", description: null, tone: null },
			});

			expect(prompt).toContain("cinematic orchestral");
		});
	});

	describe("creature", () => {
		it("asks for one wordless utterance, not dialogue", () => {
			const prompt = buildAudioPrompt({
				kind: "creature",
				campaign: CAMPAIGN,
				entity: {
					name: "Bone Tyrant",
					entityType: "monster",
					description: "A drowned dragon, throat full of silt.",
				},
			});

			expect(prompt).toContain("Bone Tyrant");
			expect(prompt).toContain("no words");
			expect(prompt).toContain("no music");
		});
	});

	describe("voice", () => {
		it("returns the line verbatim, because TTS speaks whatever it is given", () => {
			const line = "You should not have come back here.";
			const prompt = buildAudioPrompt({
				kind: "voice",
				campaign: CAMPAIGN,
				entity: { name: "Ferryman", entityType: "npc", description: "Grim." },
				line,
			});

			// No stage direction, no campaign name, no entity name — the model would
			// read every one of them aloud.
			expect(prompt).toBe(line);
		});

		it("refuses to build a voice prompt with no line", () => {
			expect(() =>
				buildAudioPrompt({ kind: "voice", campaign: CAMPAIGN })
			).toThrow(/line of dialogue is required/i);
		});
	});
});

describe("buildAudioTitle", () => {
	it("names the track after the entity it came from", () => {
		expect(
			buildAudioTitle({
				kind: "ambience",
				campaign: CAMPAIGN,
				entity: {
					name: "The Weeping Crypt",
					entityType: "location",
					description: null,
				},
			})
		).toBe("Ambience: The Weeping Crypt");
	});

	it("falls back to the campaign when there is no more specific subject", () => {
		expect(buildAudioTitle({ kind: "music", campaign: CAMPAIGN })).toBe(
			"Theme: The Drowned Crown"
		);
	});
});
