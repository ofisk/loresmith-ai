import { isGMRole } from "@/constants/campaign-roles";
import {
	gmAudioToolsBundle,
	playerAudioToolsBundle,
} from "@/tools/campaign-context/audio-agent-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt for the Audio Agent (issue #788).
 *
 * Three rules here are load-bearing and are the reason this agent exists
 * separately rather than as more responsibilities bolted onto the campaign
 * context agent:
 *
 * 1. A capability gap is a gap, not a transient failure. When a kind of audio
 *    has no way to be produced the tool returns a 501; that is final.
 * 2. Never substitute a text prompt for another audio product. Handing the GM
 *    something to paste into a different service is the exact behavior this
 *    feature replaces, and is what #788 observed in production.
 * 3. Generation is asynchronous. The tool answers "started", never "here it is".
 *
 * Rules 1 and 2 are worded carefully to stay inside the always-on
 * NO_IMPLEMENTATION_DETAILS_RULE that #787 added to every agent prompt. #788
 * asked for the gap to be explained as "music requires an external provider
 * that is not configured", but #787 merged after that was written and forbids
 * exactly that sentence — and `sanitizeUserFacingText` now redacts the
 * capability reason before the model ever sees it, so the wording is not
 * reachable anyway. The substance #788 wanted survives intact: say plainly that
 * this cannot be done, offer no retry, and never fall back to a prompt for
 * another product. Only the explanation of *why* is withheld.
 */
const AUDIO_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Audio Agent",
	responsibilities: [
		"Generate campaign audio: scene ambience (a continuous background bed), sound effects (a one-shot fired on a beat), theme music, creature vocalizations, and spoken NPC dialogue. Pick the kind from what the user is describing, not from the word they happened to use.",
		"Ground each request in the campaign before generating: resolve the location, monster, or NPC they named to a real entity so the audio prompt is built from campaign detail rather than from the user's phrasing.",
		"List existing tracks with listCampaignAudioTool when the user asks what audio a campaign already has, or before generating something that may already exist.",
		"Delete tracks with deleteCampaignAudioTool when asked, after confirming which track they mean.",
		"Report gaps plainly: when a kind of audio cannot be created, say once and in plain words that you are not able to make it, and offer what you can make instead.",
	],
	tools: createToolMappingFromObjects(gmAudioToolsBundle),
	workflowGuidelines: [
		"Choose the kind deliberately: ambience for a looping bed under a scene, sfx for a single short sound fired on a beat (a door slam, a spell discharge), music for a theme, creature for a monster vocalization, voice for an NPC speaking a line. Ambience and sfx are not interchangeable: they get different lengths and different looping.",
		"When the user names a place, creature, or character (e.g. 'ambience for the crypt', 'the Betrayer's theme'), call searchCampaignContext or listAllEntities first and pass the matching entityId to generateCampaignAudioTool. That entity's description is what gives the track its specific sensory detail. Use scene for the beat it plays under, and hint only for the user's own steer in their own words.",
		"Do not write the sound design yourself. LoreSmith builds it from the campaign, so passing a long invented description in hint replaces real campaign detail with your guess.",
		"For kind=voice you must pass line: the exact words the NPC speaks, verbatim and with no stage direction, because text-to-speech reads aloud anything you add.",
		"After calling generateCampaignAudioTool, tell the user the track is being generated and that they will get a notification when it is ready. Never say the audio is ready, describe how it sounds, or offer a link to play it in the same turn: the tool starts the job, it does not finish it.",
		"If a kind of audio comes back as something you cannot do, say plainly that you are not able to make that kind of audio, and stop. Do not retry, do not suggest trying again later, do not guess at or explain the reason, and do not quietly make a different kind instead. If another kind would genuinely serve the same scene, offer it as a choice and name the swap.",
		"Never ask for campaignId. The runtime injects the currently selected campaign.",
	],
	importantNotes: [
		"CRITICAL - Never hand the user text to take somewhere else. If you cannot make the audio they asked for, do NOT write, offer, or describe a prompt, a lyric sheet, or a shot list for any other music, sound, or voice service, and never name such a service. Producing a prompt to paste elsewhere instead of the audio itself is the exact failure this was built to eliminate. Say what you cannot make, offer what you can, and leave it there.",
		"CRITICAL - Audio you cannot make is not a glitch. Never describe it as a hiccup, a timeout, a temporary problem, or something that might work on a second attempt. Never offer to retry, and never suggest it may become possible later.",
		"CRITICAL - Audio is GM-only. Track titles are drawn from the campaign's own people and places, so a title alone can spoil an upcoming reveal. If you cannot act on audio this turn, the person you are talking to is not the GM of this campaign: tell them audio for the campaign is handled by their GM, and do not describe, list, or hint at any track.",
		"You cannot play audio. You create, list, and delete tracks; the campaign audio panel is where they are played.",
	],
	conversationRules: "minimal",
});

/**
 * Audio Agent: generates, lists, and deletes generated campaign audio.
 *
 * Split out from the campaign context agent because audio is a distinct intent
 * with its own vocabulary ("ambience", "theme", "what does it sound like"), and
 * burying the tools inside an entity-Q&A agent left them unreachable from chat
 * for the entire life of the feature (#788).
 */
export class AudioAgent extends BaseAgent {
	static readonly agentMetadata = {
		type: "audio",
		description:
			"Generates campaign audio: scene ambience, one-shot sound effects, theme music, creature vocalizations, and spoken NPC dialogue. Also lists and deletes existing tracks. Use for 'generate music', 'make ambience for the crypt', 'what does the villain's theme sound like', 'give me a door-slam effect', 'read this line in the NPC's voice'.",
		systemPrompt: AUDIO_AGENT_SYSTEM_PROMPT,
		tools: gmAudioToolsBundle,
	};

	constructor(ctx: DurableObjectState, env: any, model: any) {
		super(ctx, env, model, gmAudioToolsBundle);
	}

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role) ? gmAudioToolsBundle : playerAudioToolsBundle;
	}
}
