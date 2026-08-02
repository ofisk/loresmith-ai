import { describe, expect, it } from "vitest";
import { AudioAgent } from "../../src/agents/audio-agent";
import {
	NO_IMPLEMENTATION_DETAILS_RULE,
	PLAIN_LANGUAGE_RULE,
} from "../../src/agents/system-prompts";
import { CAMPAIGN_ROLES } from "../../src/constants/campaign-roles";
import type { CampaignRole } from "../../src/types/campaign";

/**
 * Issue #788. The audio feature shipped fully working and completely
 * unreachable: its tools lived on an agent whose routing description never
 * mentioned sound, so the classifier had no signal to route on and chat
 * answered "I cannot generate audio".
 *
 * These tests pin the two properties that made it unreachable — a description
 * the router can actually match, and a GM-only toolset — plus the prompt rules
 * that keep a missing provider from being reported as a retryable blip or
 * papered over with a Suno prompt.
 */

/**
 * `getToolsForRole` is protected and does not touch `this`, so it is called off
 * the prototype rather than standing up a Durable Object to reach it.
 */
function toolsForRole(role: CampaignRole | null): Record<string, unknown> {
	const getToolsForRole = (
		AudioAgent.prototype as unknown as {
			getToolsForRole: (r: CampaignRole | null) => Record<string, unknown>;
		}
	).getToolsForRole;
	return getToolsForRole.call(AudioAgent.prototype, role);
}

const AUDIO_TOOLS = [
	"generateCampaignAudioTool",
	"listCampaignAudioTool",
	"deleteCampaignAudioTool",
];

describe("AudioAgent role gating", () => {
	it("gives GM roles the full audio toolset", () => {
		for (const role of [
			CAMPAIGN_ROLES.OWNER,
			CAMPAIGN_ROLES.EDITOR_GM,
			CAMPAIGN_ROLES.READONLY_GM,
		]) {
			const tools = toolsForRole(role);
			for (const name of AUDIO_TOOLS) {
				expect(tools[name], `${role} should have ${name}`).toBeDefined();
			}
		}
	});

	// Audio has no player-safe subset: `buildAudioTitle` names tracks after
	// campaign entities, so "Theme: The Betrayer's Reveal" spoils a session by
	// existing. Players get an empty bundle, not a sanitized one.
	it("gives player roles no tools at all", () => {
		for (const role of [
			CAMPAIGN_ROLES.EDITOR_PLAYER,
			CAMPAIGN_ROLES.READONLY_PLAYER,
		]) {
			expect(toolsForRole(role)).toEqual({});
		}
	});

	it("gives an unknown role no tools", () => {
		expect(toolsForRole(null)).toEqual({});
	});

	it("lets a GM resolve entities so prompts are built from campaign context", () => {
		const tools = toolsForRole(CAMPAIGN_ROLES.OWNER);
		expect(tools.searchCampaignContext).toBeDefined();
		expect(tools.listAllEntities).toBeDefined();
	});
});

describe("AudioAgent routing metadata", () => {
	it("registers under the audio agent type", () => {
		expect(AudioAgent.agentMetadata.type).toBe("audio");
	});

	// The root cause of #788: the description is the only thing the classifier
	// sees, and the one it had said nothing about sound.
	it("describes the vocabulary an audio request actually uses", () => {
		const description = AudioAgent.agentMetadata.description.toLowerCase();
		for (const term of [
			"ambience",
			"sound effect",
			"music",
			"voice",
			"generate music",
		]) {
			expect(description, `description should mention "${term}"`).toContain(
				term
			);
		}
	});
});

describe("AudioAgent system prompt", () => {
	const prompt = AudioAgent.agentMetadata.systemPrompt;

	it("forbids substituting a prompt for another service", () => {
		expect(prompt).toMatch(/never hand the user text to take somewhere else/i);
		expect(prompt).toMatch(/never name such a service/i);
	});

	it("forbids treating an impossible request as retryable", () => {
		expect(prompt).toMatch(/is not a glitch/i);
		expect(prompt).toMatch(/never offer to retry/i);
	});

	// #787 (merged after #788 was written) bans explaining a gap in terms of
	// setup, and `sanitizeUserFacingText` redacts the capability reason before
	// the model sees it. So the gap is stated, never justified — and the agent
	// must not prime itself with the names of the services it must not offer.
	//
	// The shared rules are stripped first: #787's own text quotes "an audio
	// provider isn't configured" as an example of what never to say, so asserting
	// over the assembled prompt would only re-test that boilerplate.
	it("states a gap without naming setup or a rival service", () => {
		const ownText = prompt
			.replace(NO_IMPLEMENTATION_DETAILS_RULE, "")
			.replace(PLAIN_LANGUAGE_RULE, "");

		expect(ownText).not.toMatch(/not configured/i);
		expect(ownText).not.toMatch(/\b(suno|udio|aiva|elevenlabs|cloudflare)\b/i);
		expect(ownText).not.toMatch(/\b(audio|music|voice|speech)\s+providers?\b/i);
	});

	it("sets asynchronous expectations for generation", () => {
		expect(prompt).toMatch(/notification when it is ready/i);
		expect(prompt).toMatch(/never say the audio is ready/i);
	});

	it("requires grounding a request in campaign entities before generating", () => {
		expect(prompt).toContain("searchCampaignContext");
		expect(prompt).toMatch(/pass the matching entityid/i);
	});
});
