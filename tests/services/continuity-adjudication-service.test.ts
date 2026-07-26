import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContinuityAdjudicationService } from "@/services/continuity/continuity-adjudication-service";
import type { LLMProvider } from "@/services/llm/llm-provider";
import type { ContinuityCandidate } from "@/types/continuity";

function candidate(index: number): ContinuityCandidate {
	return {
		fingerprint: `state_contradiction:${index}`,
		type: "state_contradiction",
		subjectEntityId: `camp-1_npc-${index}`,
		subjectName: `NPC ${index}`,
		question: `Deterministic question ${index}`,
		rationale: `Rationale ${index}`,
		evidence: [
			{
				source: "world_state_changelog",
				label: "Session 12 world state",
				referenceId: "cl-12",
				sessionNumber: 12,
				excerpt: "recorded as dead",
			},
			{
				source: "session_digest",
				label: "Session 19 digest",
				referenceId: "digest-19",
				sessionNumber: 19,
				excerpt: "still scheming",
			},
		],
		earlierSession: 12,
		laterSession: 19,
	};
}

function provider(
	generateStructuredOutput: LLMProvider["generateStructuredOutput"]
): LLMProvider {
	return {
		generateSummary: vi.fn(),
		generateStructuredOutput,
	} as unknown as LLMProvider;
}

describe("ContinuityAdjudicationService", () => {
	let triageOutput: ReturnType<typeof vi.fn>;
	let adjudicationOutput: ReturnType<typeof vi.fn>;

	function buildService() {
		return new ContinuityAdjudicationService({
			apiKey: "test-key",
			triageProvider: provider(triageOutput as never),
			adjudicationProvider: provider(adjudicationOutput as never),
		});
	}

	beforeEach(() => {
		triageOutput = vi.fn();
		adjudicationOutput = vi.fn();
	});

	it("keeps only the candidates triage marks worth keeping", async () => {
		triageOutput.mockResolvedValue({
			verdicts: [
				{ index: 0, worthKeeping: true },
				{ index: 1, worthKeeping: false },
			],
		});

		const kept = await buildService().triage([candidate(0), candidate(1)]);

		expect(kept).toHaveLength(1);
		expect(kept[0].subjectName).toBe("NPC 0");
	});

	it("drops a triage batch that fails rather than letting it through unvetted", async () => {
		triageOutput.mockRejectedValue(new Error("provider unavailable"));

		const kept = await buildService().triage([candidate(0)]);

		expect(kept).toEqual([]);
	});

	it("batches triage so a large candidate set is not one giant prompt", async () => {
		triageOutput.mockResolvedValue({ verdicts: [] });
		const candidates = Array.from({ length: 25 }, (_, i) => candidate(i));

		await buildService().triage(candidates);

		// 25 candidates at a batch size of 12 → 3 calls.
		expect(triageOutput).toHaveBeenCalledTimes(3);
	});

	it("returns only candidates adjudged to be real contradictions", async () => {
		adjudicationOutput.mockResolvedValue({
			verdicts: [
				{
					index: 0,
					isContradiction: true,
					confidence: "high",
					question:
						"Session 12 recorded the death; session 19 references him. Intentional?",
					detail: "Check whether the death was faked.",
				},
				{ index: 1, isContradiction: false, confidence: "low" },
			],
		});

		const results = await buildService().adjudicate([
			candidate(0),
			candidate(1),
		]);

		expect(results).toHaveLength(1);
		expect(results[0].confidence).toBe("high");
		expect(results[0].question).toContain("Intentional?");
		expect(results[0].detail).toBe("Check whether the death was faked.");
	});

	it("falls back to the detector's phrasing when the model returns none", async () => {
		adjudicationOutput.mockResolvedValue({
			verdicts: [{ index: 0, isContradiction: true, confidence: "medium" }],
		});

		const [result] = await buildService().adjudicate([candidate(0)]);

		expect(result.question).toBe("Deterministic question 0");
		expect(result.detail).toBeNull();
	});

	it("treats an unrecognised confidence value as low", async () => {
		adjudicationOutput.mockResolvedValue({
			verdicts: [{ index: 0, isContradiction: true, confidence: "very sure" }],
		});

		const [result] = await buildService().adjudicate([candidate(0)]);

		expect(result.confidence).toBe("low");
	});

	it("ignores verdicts pointing at a candidate index that does not exist", async () => {
		adjudicationOutput.mockResolvedValue({
			verdicts: [{ index: 99, isContradiction: true, confidence: "high" }],
		});

		expect(await buildService().adjudicate([candidate(0)])).toEqual([]);
	});

	it("makes no provider calls for an empty candidate list", async () => {
		const service = buildService();

		expect(await service.triage([])).toEqual([]);
		expect(await service.adjudicate([])).toEqual([]);
		expect(triageOutput).not.toHaveBeenCalled();
		expect(adjudicationOutput).not.toHaveBeenCalled();
	});
});
