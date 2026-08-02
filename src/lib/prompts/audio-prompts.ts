import type { AudioKind } from "@/types/campaign-audio";

/**
 * Prompt construction for generated campaign audio (issue #756).
 *
 * These prompts are built from campaign context rather than typed raw by the
 * user, which is the whole point of generating audio inside LoreSmith instead of
 * pasting the same words into a standalone audio tool. Tone comes from the
 * campaign, sensory detail from the entity graph, scene beats from planning tasks.
 *
 * Audio models want the OPPOSITE of what an LLM wants. Narrative prose produces
 * muddy output; a sound model wants a dense, comma-separated list of concrete
 * sound sources, and a music model wants instrumentation, mood, and tempo. So the
 * builders here extract and compress rather than summarize, and they deliberately
 * throw away plot, names, and causality — none of which are audible.
 *
 * `voice` is the exception and the sharp edge: for text-to-speech the prompt IS
 * the literal line to be spoken, so anything added to it gets read aloud. Nothing
 * may be appended to a voice prompt.
 */

/** Campaign-level context available to every prompt. */
export interface AudioCampaignContext {
	name: string;
	description?: string | null;
	/** Free-text tone, e.g. "grim, waterlogged, low fantasy". */
	tone?: string | null;
	gameSystem?: string | null;
}

/** Detail drawn from a single entity (a location, a monster, an NPC). */
export interface AudioEntityContext {
	name: string;
	entityType: string;
	/** Prose description from the entity record. */
	description?: string | null;
}

export interface BuildAudioPromptInput {
	kind: AudioKind;
	campaign: AudioCampaignContext;
	/** The location, creature, or NPC the audio is for. */
	entity?: AudioEntityContext | null;
	/** Scene beat text, e.g. a planning task title or a runsheet scene. */
	scene?: string | null;
	/** Direct GM steer, always given the most weight. */
	hint?: string | null;
	/** For `voice`: the exact line to speak. Required for that kind. */
	line?: string | null;
}

/** Providers reject or truncate very long prompts; keep well inside their bounds. */
const MAX_PROMPT_CHARS = 900;

/**
 * Sensory words worth keeping when mining a description for audible detail.
 *
 * A deliberately small, hand-picked list rather than an LLM call: this runs on
 * every generation, an extra model round-trip would double latency on a feature
 * that is already slow, and the failure mode of missing a word is mild.
 */
const AUDIBLE_HINTS: Array<{ pattern: RegExp; sound: string }> = [
	{
		pattern: /\b(water|flood|wet|damp|pool|river|sea|rain)\w*/i,
		sound: "dripping and trickling water",
	},
	{
		pattern: /\b(cave|cavern|crypt|tomb|tunnel|underground|dungeon)\w*/i,
		sound: "deep stone echo, distant low rumble",
	},
	{
		pattern: /\b(tavern|inn|market|crowd|festival|town|city)\w*/i,
		sound: "murmuring crowd, clinking cups, muffled footsteps",
	},
	{
		pattern: /\b(forest|wood|grove|jungle|tree)\w*/i,
		sound: "rustling leaves, wind through branches, distant birds",
	},
	{
		pattern: /\b(fire|flame|burn|forge|torch|ember)\w*/i,
		sound: "crackling fire",
	},
	{
		pattern: /\b(storm|thunder|wind|gale)\w*/i,
		sound: "howling wind, rolling thunder",
	},
	{
		pattern: /\b(ship|boat|harbou?r|dock|sail)\w*/i,
		sound: "creaking timber, lapping water, distant gulls",
	},
	{
		pattern: /\b(machine|clockwork|gear|construct|factory)\w*/i,
		sound: "grinding gears, rhythmic metallic clanking",
	},
	{
		pattern: /\b(temple|shrine|cathedral|chapel|sanctum)\w*/i,
		sound: "long reverberant space, faint distant chanting",
	},
	{
		pattern: /\b(swamp|marsh|bog|fen)\w*/i,
		sound: "bubbling muck, insect drone, croaking",
	},
	{
		pattern: /\b(ice|frozen|snow|glacier|frost)\w*/i,
		sound: "cracking ice, thin whistling wind",
	},
	{
		pattern: /\b(battle|war|siege|army)\w*/i,
		sound: "distant shouting, clashing metal",
	},
];

/** Tone words that a music model can actually act on. */
const MUSIC_TONE_HINTS: Array<{ pattern: RegExp; mood: string }> = [
	{
		pattern: /\b(grim|dark|bleak|grimdark|horror|dread)\w*/i,
		mood: "dark, ominous, low strings",
	},
	{
		pattern: /\b(heroic|epic|noble|triumph)\w*/i,
		mood: "heroic, swelling brass, driving percussion",
	},
	{
		pattern: /\b(mystery|arcane|eldritch|weird|uncanny)\w*/i,
		mood: "unsettling, dissonant, shimmering high tones",
	},
	{
		pattern: /\b(whimsical|light|comic|cheerful|pastoral)\w*/i,
		mood: "light, playful woodwinds, warm strings",
	},
	{
		pattern: /\b(political|court|intrigue|noble house)\w*/i,
		mood: "tense, restrained, plucked strings",
	},
	{
		pattern: /\b(nautical|pirate|sea)\w*/i,
		mood: "rolling nautical rhythm, fiddle and accordion",
	},
	{
		pattern: /\b(desert|sand|dune)\w*/i,
		mood: "sparse, modal, hand percussion",
	},
];

function collectMatches<T>(
	text: string,
	table: Array<{ pattern: RegExp } & T>,
	pick: (entry: T) => string,
	limit: number
): string[] {
	const found: string[] = [];
	for (const entry of table) {
		if (found.length >= limit) break;
		if (entry.pattern.test(text)) {
			const value = pick(entry);
			if (!found.includes(value)) found.push(value);
		}
	}
	return found;
}

function contextText(input: BuildAudioPromptInput): string {
	return [
		input.campaign.description,
		input.campaign.tone,
		input.entity?.name,
		input.entity?.description,
		input.scene,
		input.hint,
	]
		.filter(Boolean)
		.join(" ");
}

function clamp(prompt: string): string {
	const collapsed = prompt.replace(/\s+/g, " ").trim();
	return collapsed.length > MAX_PROMPT_CHARS
		? collapsed.slice(0, MAX_PROMPT_CHARS).replace(/,[^,]*$/, "")
		: collapsed;
}

/**
 * Scene ambience: a list of concrete, continuous sound sources.
 *
 * Explicitly asks for no music and no speech, because sound models will happily
 * slip a melodic pad or a mumbled voice into an ambience bed, and either one
 * ruins a track meant to loop under a GM talking over it.
 */
function buildAmbiencePrompt(input: BuildAudioPromptInput): string {
	const text = contextText(input);
	const sounds = collectMatches(text, AUDIBLE_HINTS, (e) => e.sound, 4);

	const subject =
		input.hint?.trim() ||
		input.entity?.name ||
		input.scene ||
		input.campaign.name;

	const parts = [
		`Continuous background ambience for a tabletop RPG scene: ${subject}.`,
		sounds.length > 0 ? `Audible elements: ${sounds.join(", ")}.` : null,
		"Steady and loopable, no melody, no music, no speech, no sudden transitions.",
	].filter(Boolean);

	return clamp(parts.join(" "));
}

/**
 * A one-shot sound effect: a door slam, a spell discharge, a blade on shield.
 *
 * The inverse of the ambience prompt in every respect, which is why it is a
 * separate builder rather than a flag. Ambience asks for something steady with
 * no transitions, because it plays under a GM talking; an effect is *entirely*
 * transient, and asking for a loopable bed would produce a five-second wash
 * where a single sharp hit was wanted. Campaign context is used sparingly here —
 * a door slam does not need the campaign's tone, and mining the entity graph for
 * atmosphere would smear the hit into a bed.
 */
function buildSfxPrompt(input: BuildAudioPromptInput): string {
	const subject =
		input.hint?.trim() || input.entity?.name || input.scene || "sound effect";

	const parts = [
		`Single isolated sound effect for a tabletop RPG: ${subject}.`,
		"One discrete event, close and dry, sharp transient, silence before and after.",
		"No music, no speech, no continuous background ambience.",
	];

	return clamp(parts.join(" "));
}

/**
 * Campaign theme music: instrumentation and mood, plus an explicit request for a
 * short recognizable motif.
 *
 * The leitmotif is what GMs actually want — a phrase the table learns to dread
 * when the villain walks in — so the prompt asks for one directly rather than
 * for "music that sounds like the campaign".
 */
function buildMusicPrompt(input: BuildAudioPromptInput): string {
	const text = contextText(input);
	const moods = collectMatches(text, MUSIC_TONE_HINTS, (e) => e.mood, 2);

	const subject =
		input.hint?.trim() || input.entity?.name || input.campaign.name;

	const parts = [
		`Instrumental theme music for a tabletop RPG: ${subject}.`,
		moods.length > 0
			? `Character: ${moods.join("; ")}.`
			: "Character: cinematic orchestral, moderate tempo.",
		"Built around one short memorable motif that repeats. Loopable, no vocals, no lyrics.",
	];

	return clamp(parts.join(" "));
}

/**
 * Creature vocalization.
 *
 * Two very different prompts depending on which provider serves it, but the
 * service does not know the provider at prompt time, so this splits the
 * difference: name the creature, describe the sound in onomatopoeic terms that a
 * TTS model can approximate and a sound model can render properly, and ask for a
 * single non-verbal one-shot.
 */
function buildCreaturePrompt(input: BuildAudioPromptInput): string {
	const creature = input.entity?.name ?? "creature";
	const detail = input.hint?.trim() || input.entity?.description || "";

	const parts = [
		`Single non-verbal creature vocalization: ${creature}.`,
		detail ? `Described as: ${detail}.` : null,
		"One short guttural utterance, no words, no music, no background ambience.",
	].filter(Boolean);

	return clamp(parts.join(" "));
}

/**
 * NPC voice.
 *
 * Returns the line VERBATIM. A text-to-speech model speaks whatever it is given,
 * so appending stage direction here would have the NPC read the stage direction
 * aloud. Tone and character must be expressed through voice selection, not text.
 */
function buildVoicePrompt(input: BuildAudioPromptInput): string {
	const line = input.line?.trim();
	if (!line) {
		throw new Error("A line of dialogue is required to generate NPC voice");
	}
	return line.slice(0, MAX_PROMPT_CHARS);
}

export function buildAudioPrompt(input: BuildAudioPromptInput): string {
	switch (input.kind) {
		case "ambience":
			return buildAmbiencePrompt(input);
		case "sfx":
			return buildSfxPrompt(input);
		case "music":
			return buildMusicPrompt(input);
		case "creature":
			return buildCreaturePrompt(input);
		case "voice":
			return buildVoicePrompt(input);
		default: {
			const exhaustive: never = input.kind;
			throw new Error(`Unsupported audio kind: ${String(exhaustive)}`);
		}
	}
}

/** Default track title when the caller does not supply one. */
export function buildAudioTitle(input: BuildAudioPromptInput): string {
	const subject =
		input.entity?.name ||
		input.scene ||
		input.hint?.trim() ||
		input.campaign.name;

	const label: Record<AudioKind, string> = {
		ambience: "Ambience",
		sfx: "Effect",
		music: "Theme",
		creature: "Sound",
		voice: "Voice",
	};

	return `${label[input.kind]}: ${subject}`.slice(0, 120);
}
