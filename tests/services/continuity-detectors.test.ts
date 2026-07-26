import { describe, expect, it } from "vitest";
import type { CampaignRule } from "@/services/campaign/rules-context-service";
import type {
	ContinuityCorpus,
	CorpusChangelogEntry,
	CorpusDigest,
} from "@/services/continuity/continuity-corpus";
import { digestTextBlocks } from "@/services/continuity/continuity-corpus";
import {
	buildFingerprint,
	isMatchableName,
	mentionsName,
	tokenOverlap,
} from "@/services/continuity/continuity-text-utils";
import {
	classifyEntityStatus,
	classifyRelationshipStatus,
	looksLikeRuling,
} from "@/services/continuity/continuity-vocabulary";
import { detectDanglingThreads } from "@/services/continuity/detect-dangling-threads";
import { detectRelationshipContradictions } from "@/services/continuity/detect-relationship-contradictions";
import { detectRulesContradictions } from "@/services/continuity/detect-rules-contradictions";
import { detectStateContradictions } from "@/services/continuity/detect-state-contradictions";
import { detectTimelineContradictions } from "@/services/continuity/detect-timeline-contradictions";
import type { SessionDigestData } from "@/types/session-digest";

const CAMPAIGN_ID = "camp-1";

function digestData(
	overrides: Partial<{
		keyEvents: string[];
		openThreads: string[];
		npcsToRun: string[];
		beats: string[];
	}> = {}
): SessionDigestData {
	return {
		last_session_recap: {
			key_events: overrides.keyEvents ?? [],
			state_changes: { factions: [], locations: [], npcs: [] },
			open_threads: overrides.openThreads ?? [],
		},
		next_session_plan: {
			objectives_dm: [],
			probable_player_goals: [],
			beats: overrides.beats ?? [],
			if_then_branches: [],
		},
		npcs_to_run: overrides.npcsToRun ?? [],
		locations_in_focus: [],
		encounter_seeds: [],
		clues_and_revelations: [],
		treasure_and_rewards: [],
		todo_checklist: [],
	};
}

function digest(
	sessionNumber: number,
	data: SessionDigestData,
	sessionDate: string | null = null
): CorpusDigest {
	return {
		id: `digest-${sessionNumber}`,
		sessionNumber,
		sessionDate,
		createdAt: `2025-01-0${Math.min(sessionNumber, 9)}T00:00:00Z`,
		data,
		blocks: digestTextBlocks(data),
	};
}

function changelog(
	id: string,
	sessionNumber: number | null,
	payload: Partial<CorpusChangelogEntry["payload"]>
): CorpusChangelogEntry {
	return {
		id,
		sessionNumber,
		timestamp: `2025-01-${String(sessionNumber ?? 1).padStart(2, "0")}T00:00:00Z`,
		payload: {
			campaign_session_id: sessionNumber,
			timestamp: `2025-01-${String(sessionNumber ?? 1).padStart(2, "0")}T00:00:00Z`,
			entity_updates: payload.entity_updates ?? [],
			relationship_updates: payload.relationship_updates ?? [],
			new_entities: payload.new_entities ?? [],
		},
	};
}

function corpus(overrides: Partial<ContinuityCorpus> = {}): ContinuityCorpus {
	const digests = overrides.digests ?? [];
	return {
		campaignId: CAMPAIGN_ID,
		digests,
		changelog: overrides.changelog ?? [],
		entityNames: overrides.entityNames ?? new Map(),
		neighbors: overrides.neighbors ?? new Map(),
		maxSessionNumber:
			overrides.maxSessionNumber ??
			(digests.length ? digests[digests.length - 1].sessionNumber : null),
	};
}

describe("continuity text utils", () => {
	it("matches names on whole-word boundaries only", () => {
		expect(mentionsName("Lord Vane entered the hall", "Vane")).toBe(true);
		expect(mentionsName("Vane's signet ring", "Vane")).toBe(true);
		expect(mentionsName("The weathervane spun", "Vane")).toBe(false);
	});

	it("rejects short and generic single-word names", () => {
		expect(isMatchableName("Vane")).toBe(true);
		expect(isMatchableName("Bo")).toBe(false);
		expect(isMatchableName("guards")).toBe(false);
		expect(isMatchableName("The Council")).toBe(true);
	});

	it("produces stable fingerprints that ignore cosmetic differences", () => {
		const left = buildFingerprint("state_contradiction", ["Vane", 12, 19]);
		const right = buildFingerprint("state_contradiction", ["  vane ", 12, 19]);
		expect(left).toBe(right);
		expect(left).not.toBe(
			buildFingerprint("state_contradiction", ["Vane", 12, 20])
		);
	});

	it("scores token overlap between related and unrelated text", () => {
		expect(
			tokenOverlap(
				"Find the missing courier from Blackreach",
				"The missing courier from Blackreach was found dead"
			)
		).toBeGreaterThan(0.5);
		expect(
			tokenOverlap("Find the missing courier", "The tavern burned down")
		).toBeLessThan(0.2);
	});
});

describe("continuity vocabulary", () => {
	it("buckets entity statuses", () => {
		expect(classifyEntityStatus("dead")).toBe("removed");
		expect(classifyEntityStatus("keep destroyed")).toBe("removed");
		expect(classifyEntityStatus("imprisoned in Vaelport")).toBe("absent");
		expect(classifyEntityStatus("wounded but stable")).toBe("other");
	});

	it("treats a restoration as restored even when it names the death", () => {
		expect(classifyEntityStatus("resurrected after being killed")).toBe(
			"restored"
		);
	});

	it("classifies relationship polarity", () => {
		expect(classifyRelationshipStatus("allied")).toBe("allied");
		expect(classifyRelationshipStatus("openly hostile")).toBe("hostile");
		expect(classifyRelationshipStatus("cordial")).toBe("neutral");
	});

	it("spots ruling-shaped digest lines", () => {
		expect(looksLikeRuling("We ruled that flanking grants advantage")).toBe(
			true
		);
		expect(looksLikeRuling("The party travelled north")).toBe(false);
	});
});

describe("detectStateContradictions", () => {
	const entityNames = new Map([[`${CAMPAIGN_ID}_vane`, "Vane"]]);

	it("flags an entity referenced after being recorded dead", () => {
		const candidates = detectStateContradictions(
			corpus({
				entityNames,
				changelog: [
					changelog("cl-12", 12, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
					}),
				],
				digests: [
					digest(12, digestData({ keyEvents: ["Vane fell to the assassin"] })),
					digest(19, digestData({ npcsToRun: ["Vane, still scheming"] })),
				],
			})
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].type).toBe("state_contradiction");
		expect(candidates[0].subjectName).toBe("Vane");
		expect(candidates[0].earlierSession).toBe(12);
		expect(candidates[0].laterSession).toBe(19);
		expect(candidates[0].question).toContain("Intentional?");
	});

	it("always cites both sides of the contradiction", () => {
		const [candidate] = detectStateContradictions(
			corpus({
				entityNames,
				changelog: [
					changelog("cl-12", 12, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
					}),
				],
				digests: [digest(19, digestData({ npcsToRun: ["Vane"] }))],
			})
		);

		expect(candidate.evidence).toHaveLength(2);
		expect(candidate.evidence.map((item) => item.source)).toEqual([
			"world_state_changelog",
			"session_digest",
		]);
		expect(candidate.evidence[1].referenceId).toBe("digest-19");
	});

	it("does not flag a resurrection", () => {
		const candidates = detectStateContradictions(
			corpus({
				entityNames,
				changelog: [
					changelog("cl-12", 12, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
					}),
					changelog("cl-15", 15, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "resurrected" },
						],
					}),
				],
				digests: [digest(19, digestData({ npcsToRun: ["Vane"] }))],
			})
		);

		expect(candidates).toEqual([]);
	});

	it("ignores mentions in the session that recorded the death", () => {
		const candidates = detectStateContradictions(
			corpus({
				entityNames,
				changelog: [
					changelog("cl-12", 12, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
					}),
				],
				digests: [digest(12, digestData({ keyEvents: ["Vane was killed"] }))],
			})
		);

		expect(candidates).toEqual([]);
	});

	it("raises one question per later session, not one per matching line", () => {
		const candidates = detectStateContradictions(
			corpus({
				entityNames,
				changelog: [
					changelog("cl-12", 12, {
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
					}),
				],
				digests: [
					digest(
						19,
						digestData({
							keyEvents: ["Vane sent a courier", "Vane's seal was on it"],
							npcsToRun: ["Vane"],
						})
					),
				],
			})
		);

		expect(candidates).toHaveLength(1);
	});

	it("respects the incremental fromSession window", () => {
		const scanCorpus = corpus({
			entityNames,
			changelog: [
				changelog("cl-12", 12, {
					entity_updates: [
						{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
					],
				}),
			],
			digests: [digest(14, digestData({ npcsToRun: ["Vane"] }))],
		});

		expect(detectStateContradictions(scanCorpus, { fromSession: 20 })).toEqual(
			[]
		);
		expect(
			detectStateContradictions(scanCorpus, { fromSession: 13 })
		).toHaveLength(1);
	});
});

describe("detectRelationshipContradictions", () => {
	const entityNames = new Map([
		[`${CAMPAIGN_ID}_ironpact`, "Ironpact"],
		[`${CAMPAIGN_ID}_silvercourt`, "Silvercourt"],
	]);

	const flipChangelog = [
		changelog("cl-3", 3, {
			relationship_updates: [
				{
					from: `${CAMPAIGN_ID}_ironpact`,
					to: `${CAMPAIGN_ID}_silvercourt`,
					new_status: "allied",
				},
			],
		}),
		changelog("cl-9", 9, {
			relationship_updates: [
				{
					from: `${CAMPAIGN_ID}_ironpact`,
					to: `${CAMPAIGN_ID}_silvercourt`,
					new_status: "hostile",
				},
			],
		}),
	];

	it("flags an unexplained allied-to-hostile reversal", () => {
		const candidates = detectRelationshipContradictions(
			corpus({
				entityNames,
				changelog: flipChangelog,
				digests: [digest(6, digestData({ keyEvents: ["The party rested"] }))],
			})
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].type).toBe("relationship_contradiction");
		expect(candidates[0].evidence).toHaveLength(2);
	});

	it("stays quiet when an intervening session names both parties", () => {
		const candidates = detectRelationshipContradictions(
			corpus({
				entityNames,
				changelog: flipChangelog,
				digests: [
					digest(
						6,
						digestData({
							keyEvents: ["Ironpact broke its pact with Silvercourt"],
						})
					),
				],
			})
		);

		expect(candidates).toEqual([]);
	});

	it("ignores restatements of the same polarity", () => {
		const candidates = detectRelationshipContradictions(
			corpus({
				entityNames,
				changelog: [
					flipChangelog[0],
					changelog("cl-5", 5, {
						relationship_updates: [
							{
								from: `${CAMPAIGN_ID}_ironpact`,
								to: `${CAMPAIGN_ID}_silvercourt`,
								new_status: "friendly",
							},
						],
					}),
				],
			})
		);

		expect(candidates).toEqual([]);
	});
});

describe("detectTimelineContradictions", () => {
	it("flags session dates that run backwards against session numbers", () => {
		const candidates = detectTimelineContradictions(
			corpus({
				digests: [
					digest(4, digestData(), "2025-03-01"),
					digest(5, digestData(), "2025-02-01"),
				],
			})
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].type).toBe("timeline_contradiction");
		expect(candidates[0].evidence).toHaveLength(2);
	});

	it("flags an entity named before the session that introduces it", () => {
		const candidates = detectTimelineContradictions(
			corpus({
				entityNames: new Map([[`${CAMPAIGN_ID}_saltmere`, "Saltmere"]]),
				changelog: [
					changelog("cl-8", 8, {
						new_entities: [
							{ entity_id: `${CAMPAIGN_ID}_saltmere`, name: "Saltmere" },
						],
					}),
				],
				digests: [
					digest(3, digestData({ keyEvents: ["Rumours of Saltmere"] })),
				],
			})
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].subjectName).toBe("Saltmere");
	});

	it("accepts consistent dates and orderings", () => {
		const candidates = detectTimelineContradictions(
			corpus({
				digests: [
					digest(4, digestData(), "2025-02-01"),
					digest(5, digestData(), "2025-03-01"),
				],
			})
		);

		expect(candidates).toEqual([]);
	});
});

describe("detectDanglingThreads", () => {
	it("reports a thread nothing has picked up", () => {
		const candidates = detectDanglingThreads(
			corpus({
				digests: [
					digest(
						1,
						digestData({
							openThreads: ["Who poisoned the Duke's wine at the gala?"],
						})
					),
					digest(2, digestData({ keyEvents: ["The party sailed south"] })),
					digest(3, digestData({ keyEvents: ["A storm wrecked the ship"] })),
				],
			})
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].type).toBe("dangling_thread");
		expect(candidates[0].question).toContain("Still live?");
	});

	it("treats a thread as resolved when a later session covers it", () => {
		const candidates = detectDanglingThreads(
			corpus({
				digests: [
					digest(
						1,
						digestData({
							openThreads: ["Who poisoned the Duke's wine at the gala?"],
						})
					),
					digest(2, digestData()),
					digest(
						3,
						digestData({
							keyEvents: ["The steward confessed he poisoned the Duke's wine"],
						})
					),
				],
			})
		);

		expect(candidates).toEqual([]);
	});

	it("gives a recent thread time to breathe", () => {
		const candidates = detectDanglingThreads(
			corpus({
				digests: [
					digest(
						1,
						digestData({ openThreads: ["Who poisoned the Duke's wine?"] })
					),
					digest(2, digestData()),
				],
			})
		);

		expect(candidates).toEqual([]);
	});
});

describe("detectRulesContradictions", () => {
	const rules: CampaignRule[] = [
		{
			id: "rule-1",
			entityId: "rule-1",
			entityType: "house_rule",
			name: "Flanking",
			category: "combat",
			text: "Flanking grants advantage on melee attack rolls.",
			source: "house",
			priority: 100,
			active: true,
			updatedAt: "2025-01-01T00:00:00Z",
			metadata: {},
		},
	];

	it("pairs a digest ruling with the house rule it may contradict", () => {
		const candidates = detectRulesContradictions(
			corpus({
				digests: [
					digest(
						7,
						digestData({
							keyEvents: [
								"We ruled that flanking grants no advantage on melee attack rolls this campaign.",
							],
						})
					),
				],
			}),
			rules
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].type).toBe("rules_contradiction");
		expect(candidates[0].evidence.map((item) => item.source)).toEqual([
			"house_rule",
			"session_digest",
		]);
	});

	it("ignores narration that merely shares a word with a rule", () => {
		const candidates = detectRulesContradictions(
			corpus({
				digests: [
					digest(7, digestData({ keyEvents: ["The party flanked the ogre."] })),
				],
			}),
			rules
		);

		expect(candidates).toEqual([]);
	});

	it("returns nothing when the campaign has no rules", () => {
		expect(
			detectRulesContradictions(
				corpus({
					digests: [
						digest(7, digestData({ keyEvents: ["We ruled that flanking..."] })),
					],
				}),
				[]
			)
		).toEqual([]);
	});
});
