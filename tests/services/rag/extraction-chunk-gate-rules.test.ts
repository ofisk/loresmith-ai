import { describe, expect, it } from "vitest";
import {
	classifyChunkAdvisory,
	classifyChunkDecisively,
	computeChunkTextStats,
} from "../../../src/services/rag/extraction-chunk-gate-rules";

const PROSE = `The village of Harrow's Rest sits at the foot of the Grey Spine, and it has
been there for as long as anyone can remember. The miller, a broad woman named
Ilsa Vantry, keeps the only working wheel in the valley, and she is the person
that travellers are sent to when they arrive with questions about the road north.
Her brother went up that road four winters ago and did not come back, which is
why she asks after every caravan that passes through the square. There is a
shrine on the hill above the village where the old faith is still kept, though
the priest who tended it died last spring and no one has come to replace him.
The elders say the mine below the shrine was sealed for a reason, and they will
not say more than that when you press them about it.`;

describe("classifyChunkDecisively", () => {
	it("skips an empty chunk", () => {
		const match = classifyChunkDecisively("");
		expect(match?.verdict).toBe("non-substantive");
		expect(match?.rule).toBe("empty-or-whitespace");
	});

	it("skips a whitespace-only chunk", () => {
		expect(classifyChunkDecisively("   \n\n\t  ")?.verdict).toBe(
			"non-substantive"
		);
	});

	it("skips a chunk too short to describe anything", () => {
		expect(classifyChunkDecisively("Page 7")?.rule).toBe(
			"below-minimum-length"
		);
	});

	it("defers on anything else, so the gate stays conservative", () => {
		expect(classifyChunkDecisively(PROSE)).toBeNull();
		expect(
			classifyChunkDecisively("Chapter 3: The Sunken Road and its wardens")
		).toBeNull();
	});
});

describe("classifyChunkAdvisory", () => {
	it("inherits every decisive verdict", () => {
		expect(classifyChunkAdvisory("").rule).toBe("empty-or-whitespace");
	});

	it("flags copyright and legal boilerplate", () => {
		const match = classifyChunkAdvisory(
			`Copyright © 2019 Example Games. All rights reserved.
No part of this publication may be reproduced without permission.
Example Games and the Example logo are trademarks of Example Games.`
		);
		expect(match.verdict).toBe("non-substantive");
		expect(match.rule).toBe("legal-or-navigation-boilerplate");
	});

	it("flags a table of contents", () => {
		const match = classifyChunkAdvisory(
			`Table of contents
Introduction .......... 3
Chapter One .......... 12
Chapter Two .......... 47
Chapter Three .......... 88
Appendix .......... 130
Index .......... 141`
		);
		expect(match.verdict).toBe("non-substantive");
	});

	it("flags runs of numbers with no connective prose", () => {
		const match = classifyChunkAdvisory(
			"12 | 14 | 18 | 22 | 26 | 30 | 34 | 38 | 42 | 46 | 50 | 54 | 58 | 62 | 66"
		);
		expect(match.verdict).toBe("non-substantive");
		expect(match.rule).toBe("numeric-runs");
	});

	it("flags repeated filler lines", () => {
		const line = "Example Games -- Player Handbook -- Draft";
		const match = classifyChunkAdvisory(Array(12).fill(line).join("\n"));
		expect(match.verdict).toBe("non-substantive");
		expect(match.rule).toBe("repeated-filler");
	});

	it("calls dense narrative prose substantive", () => {
		const match = classifyChunkAdvisory(PROSE);
		expect(match.verdict).toBe("substantive");
		expect(match.rule).toBe("prose-density");
	});

	it("defers on short ambiguous text rather than guessing", () => {
		const match = classifyChunkAdvisory(
			"Ilsa Vantry, miller. Asks after every caravan."
		);
		expect(match.verdict).toBe("ambiguous");
	});

	it("does not mistake a stat block for boilerplate", () => {
		const match = classifyChunkAdvisory(
			`Grey Spine Wolf
Armor Class 13, Hit Points 26, Speed 40 ft.
The wolf has advantage on attack rolls against a creature if at least one of
the wolf's allies is within 5 feet of the creature and the ally is not
incapacitated. When it reduces a target to 0 hit points it will drag the body
back toward the den rather than continue the fight.`
		);
		expect(match.verdict).not.toBe("non-substantive");
	});
});

describe("computeChunkTextStats", () => {
	it("reports safe values for an empty chunk", () => {
		const stats = computeChunkTextStats("");
		expect(stats.length).toBe(0);
		expect(stats.whitespaceRatio).toBe(1);
		expect(stats.wordCount).toBe(0);
	});

	it("measures prose as high common-word density", () => {
		const stats = computeChunkTextStats(PROSE);
		expect(stats.commonWordRatio).toBeGreaterThan(0.2);
		expect(stats.boilerplateRatio).toBe(0);
	});

	it("counts duplicate lines", () => {
		const stats = computeChunkTextStats("a line\nb line\na line\na line");
		expect(stats.repeatedLineRatio).toBeCloseTo(0.5, 5);
	});
});
