/**
 * Prompts for the campaign continuity checker (issue #744).
 *
 * Both tiers are written around one premise: fiction is *full* of legitimate
 * apparent contradictions. A checker that cries wolf gets switched off after
 * one use, so both prompts are biased toward silence.
 */

import type { ContinuityCandidate } from "@/types/continuity";

/**
 * Reasons an apparent contradiction is usually fine. Shared by both tiers so
 * the cheap pass and the expensive pass reject the same things.
 */
const LEGITIMATE_EXPLANATIONS = `Apparent contradictions are normal in fiction. Do NOT flag something when it is plausibly explained by:
- Resurrection, undeath, or divine restoration
- Disguise, shapeshifting, impersonation, or a body double
- An unreliable narrator: a character, rumour, or NPC lying to the players
- A faked death, staged destruction, or a deliberate deception
- Deliberate GM retcon, or a correction the GM already made
- Flashbacks, prophecy, dreams, visions, or planar/time travel
- A name shared by more than one person, place, or thing
- A memorial, legacy, epitaph, or reference to someone in the past tense
- Plans that reference a character's absence rather than their presence`;

function formatEvidence(candidate: ContinuityCandidate): string {
	return candidate.evidence
		.map((item, index) => `  ${index + 1}. [${item.label}] ${item.excerpt}`)
		.join("\n");
}

function formatCandidate(
	candidate: ContinuityCandidate,
	index: number
): string {
	return `#${index}
Type: ${candidate.type}
Subject: ${candidate.subjectName ?? "n/a"}
Detector rationale: ${candidate.rationale}
Evidence:
${formatEvidence(candidate)}`;
}

/**
 * Cheap triage pass: shortlist candidates worth spending a quality-tier call
 * on. Runs on the analysis (fast/cheap) model tier.
 */
export function formatContinuityTriagePrompt(
	candidates: ContinuityCandidate[]
): string {
	return `You are triaging possible continuity problems in a tabletop RPG campaign. Each item below was flagged by a mechanical detector that only compares recorded facts — it does not understand the story.

For each item decide whether it is worth a game master's attention.

${LEGITIMATE_EXPLANATIONS}

Mark an item worthKeeping only when the two pieces of evidence genuinely appear to disagree and no explanation above obviously applies. When in doubt, drop it. Missing a real problem is much cheaper than raising a false one.

Candidates:
${candidates.map((candidate, index) => formatCandidate(candidate, index)).join("\n\n")}

Return ONLY JSON:
{
  "verdicts": [
    { "index": 0, "worthKeeping": true, "reason": "one short sentence" }
  ]
}
Include exactly one verdict per candidate, using the #index shown above.`;
}

/**
 * Quality pass: decide whether a shortlisted candidate is a real contradiction,
 * how confident to be, and how to phrase the question for the GM.
 */
export function formatContinuityAdjudicationPrompt(
	candidates: ContinuityCandidate[]
): string {
	return `You are helping a tabletop RPG game master check a long campaign for continuity problems. Each item below survived a first-pass filter. Decide, carefully, whether it is a real problem.

${LEGITIMATE_EXPLANATIONS}

For each item return:
- isContradiction: true only if the recorded facts genuinely conflict.
- confidence:
  - "high": the two records directly contradict each other and no in-fiction explanation is apparent.
  - "medium": they probably conflict, but an explanation above is plausible.
  - "low": likely fine; explained by normal storytelling.
- question: how to raise this with the GM. Phrase it as a QUESTION, never an accusation. Name both sessions and both facts, then ask whether it was intentional. A GM who deliberately faked a death should read your question and think the tool is sharp, not broken. Maximum two sentences.
- detail: one or two sentences on what to check, including the most likely innocent explanation.

Candidates:
${candidates.map((candidate, index) => formatCandidate(candidate, index)).join("\n\n")}

Return ONLY JSON:
{
  "verdicts": [
    {
      "index": 0,
      "isContradiction": true,
      "confidence": "high",
      "question": "...",
      "detail": "..."
    }
  ]
}
Include exactly one verdict per candidate, using the #index shown above.`;
}

/** JSON schema string for the triage tier's structured output. */
export const CONTINUITY_TRIAGE_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		verdicts: {
			type: "array",
			items: {
				type: "object",
				properties: {
					index: { type: "number" },
					worthKeeping: { type: "boolean" },
					reason: { type: "string" },
				},
				required: ["index", "worthKeeping"],
			},
		},
	},
	required: ["verdicts"],
});

/** JSON schema string for the adjudication tier's structured output. */
export const CONTINUITY_ADJUDICATION_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		verdicts: {
			type: "array",
			items: {
				type: "object",
				properties: {
					index: { type: "number" },
					isContradiction: { type: "boolean" },
					confidence: { type: "string", enum: ["high", "medium", "low"] },
					question: { type: "string" },
					detail: { type: "string" },
				},
				required: ["index", "isContradiction", "confidence", "question"],
			},
		},
	},
	required: ["verdicts"],
});
