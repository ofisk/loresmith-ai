import { tool } from "ai";
import { z } from "zod";
import type { ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity, EntityRelationship } from "@/dao/entity-dao";
import { getPlanningServices } from "@/services/rag/rag-service-factory";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	requireCampaignAccessForTool,
	requireGMRole,
	type ToolExecuteOptions,
} from "@/tools/utils";
import {
	bumpCount,
	type Difficulty,
	getDifficultySlots,
	getEntityText,
	inferThreatBand,
} from "./encounter-difficulty-utils";
import { lookupStatBlockTool } from "./rules-reference-tools";

/**
 * Encounter difficulty and composition logic.
 * Custom system; not based on D&D 5e DMG XP budgets. Uses threat bands (low/standard/high),
 * party composition scaling, and slot-based creature counts. Edge cases: low-level parties
 * penalize high-threat creatures; high-level parties penalize low-threat.
 */

const difficultySchema = z.enum(["easy", "medium", "hard", "deadly"]);

const generateEncounterSchema = z.object({
	campaignId: commonSchemas.campaignId,
	locationEntityId: z
		.string()
		.optional()
		.describe("Optional location entity ID to anchor the encounter."),
	locationHint: z
		.string()
		.optional()
		.describe("Optional location name/phrase when entity ID is unknown."),
	partyLevel: z.number().int().min(1).max(20),
	partySize: z.number().int().min(1).max(10).optional().default(4),
	targetDifficulty: difficultySchema.default("medium"),
	theme: z
		.string()
		.optional()
		.describe("Optional style/tone hint (e.g. ambush, corrupted wildlife)."),
	jwt: commonSchemas.jwt,
});

const scaleEncounterSchema = z.object({
	campaignId: commonSchemas.campaignId,
	encounterSpec: z.object({
		encounterSummary: z.string().optional(),
		recommendedParty: z
			.object({
				level: z.number().int().min(1).max(20).optional(),
				size: z.number().int().min(1).max(10).optional(),
			})
			.optional(),
		composition: z
			.array(
				z.object({
					entityId: z.string().optional(),
					name: z.string(),
					entityType: z.string().optional(),
					count: z.number().int().min(1),
					role: z.string().optional(),
					threatEstimate: z.string().optional(),
					gmUsageAdvice: z.array(z.string()).optional(),
				})
			)
			.default([]),
		environment: z
			.object({
				terrainFeatures: z.array(z.string()).optional(),
				hazards: z.array(z.string()).optional(),
				dynamicElements: z.array(z.string()).optional(),
			})
			.optional(),
		narrativeHooks: z.array(z.string()).optional(),
		generalCombatAdvice: z.array(z.string()).optional(),
		sourceContext: z
			.object({
				seedEntityIds: z.array(z.string()).optional(),
			})
			.optional(),
	}),
	targetDifficulty: difficultySchema,
	partyLevel: z.number().int().min(1).max(20).optional(),
	partySize: z.number().int().min(1).max(10).optional(),
	jwt: commonSchemas.jwt,
});

const getEncounterStatBlocksSchema = z.object({
	campaignId: commonSchemas.campaignId,
	creatures: z
		.array(
			z.object({
				name: z.string().min(1),
				entityId: z.string().optional(),
			})
		)
		.min(1)
		.max(20),
	limitPerCreature: z.number().int().min(1).max(5).optional().default(2),
	jwt: commonSchemas.jwt,
});

/** Difficulty ranking for step-based scaling (easy=1 through deadly=4). */
const DIFFICULTY_RANK: Record<Difficulty, number> = {
	easy: 1,
	medium: 2,
	hard: 3,
	deadly: 4,
};

function toWordSet(input: string | undefined): Set<string> {
	return new Set(
		(input ?? "")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 3)
	);
}

function inferRole(entity: Entity): string {
	const text = `${entity.name} ${getEntityText(entity)}`.toLowerCase();
	if (/sniper|archer|ranged/.test(text)) return "ranged pressure";
	if (/brute|ogre|giant|crusher/.test(text)) return "frontline brute";
	if (/mage|caster|shaman|priest/.test(text)) return "spell support";
	if (/assassin|skirmish|stalker/.test(text)) return "mobile skirmisher";
	if (/leader|captain|chief|boss/.test(text)) return "command leader";
	return "general combatant";
}

//TODO: add more stats based usage advice
function buildRoleBasedUsageAdvice(params: {
	role: string;
	threatBand: "low" | "standard" | "high";
	linkedFactions: string[];
	linkedLocations: string[];
}): string[] {
	const { role, threatBand, linkedFactions, linkedLocations } = params;
	const advice: string[] = [];

	switch (role) {
		case "ranged pressure":
			advice.push(
				"Open from cover and force movement with line-of-sight pressure.",
				"Keep this unit 30-60 feet from frontliners and reposition after focus fire."
			);
			break;
		case "frontline brute":
			advice.push(
				"Use this monster to hold the center and deny access to fragile allies.",
				"Spend early rounds on shoves, grapples, or area denial instead of pure damage."
			);
			break;
		case "spell support":
			advice.push(
				"Start with control or debuff effects that split the party's action economy.",
				"Protect this unit with blockers and retreat if concentration is pressured."
			);
			break;
		case "mobile skirmisher":
			advice.push(
				"Attack isolated targets, then break line of sight to avoid focus fire.",
				"Use terrain loops and alternate entry points to create crossfire."
			);
			break;
		case "command leader":
			advice.push(
				"Issue objectives to allies (pin, flank, protect) and act as morale anchor.",
				"Trigger a tactical shift when this monster is bloodied (reinforce, retreat, or escalate)."
			);
			break;
		default:
			advice.push(
				"Pair this unit with another role to avoid one-dimensional combat turns.",
				"Give it a concrete battlefield objective beyond dealing damage."
			);
	}

	if (threatBand === "high") {
		advice.push(
			"Telegraph major abilities one beat ahead so danger feels fair but serious."
		);
	}
	if (threatBand === "low") {
		advice.push(
			"Use in groups to create pressure through positioning, not individual damage."
		);
	}
	if (linkedFactions.length > 0) {
		advice.push(
			`Play this unit as acting on ${linkedFactions[0]}'s agenda, not random aggression.`
		);
	}
	if (linkedLocations.length > 0) {
		advice.push(
			`Let local terrain in ${linkedLocations[0]} shape how this unit fights.`
		);
	}

	return advice.slice(0, 4);
}

function buildGeneralCombatAdvice(params: {
	targetDifficulty: Difficulty;
	partySize: number;
	composition: Array<{ role?: string; count: number; threatEstimate?: string }>;
}): string[] {
	const { targetDifficulty, partySize, composition } = params;
	const roleSet = new Set(
		composition.map((entry) => entry.role ?? "general combatant")
	);
	const hasLeader = composition.some((entry) =>
		(entry.role ?? "").includes("leader")
	);
	const highThreatCount = composition.filter(
		(entry) => (entry.threatEstimate ?? "").toLowerCase() === "high"
	).length;

	const advice = [
		"Run enemies with a clear objective each round (delay, capture, protect, or escape), not only damage.",
		"Change battlefield state by round 3 with reinforcements, hazards, or shifting objectives.",
	];

	if (roleSet.size >= 3) {
		advice.push(
			"Sequence turns by role: controllers first, pressure units second, finishers last."
		);
	}
	if (!hasLeader) {
		advice.push(
			"Use a visible signal system (horn, chant, banner) so non-leader enemies still coordinate believably."
		);
	}
	if (highThreatCount > 0) {
		advice.push(
			"Give high-threat monsters clear telegraphs before peak actions to keep challenge fair."
		);
	}
	if (targetDifficulty === "deadly") {
		advice.push(
			"Prepare a fail-forward off-ramp (retreat terms, objective compromise, or capture) to avoid hard dead ends."
		);
	}
	if (partySize >= 5) {
		advice.push(
			"Use layered threats in different lanes so the party cannot solve the fight with one formation."
		);
	}

	return advice.slice(0, 6);
}

function splitKeywords(input: string | undefined): string[] {
	return Array.from(toWordSet(input));
}

function formatPlanningSignal(result: any): string {
	const section = String(result?.sectionType ?? "note");
	const snippet = String(result?.sectionContent ?? "")
		.replace(/\s+/g, " ")
		.slice(0, 220);
	return `${section}: ${snippet}`;
}

async function resolveLocationEntity(params: {
	campaignId: string;
	locationEntityId?: string;
	locationHint?: string;
	daoFactory: ReturnType<typeof getDAOFactory>;
}): Promise<Entity | null> {
	const { campaignId, locationEntityId, locationHint, daoFactory } = params;
	if (locationEntityId) {
		const entity = await daoFactory.entityDAO.getEntityById(locationEntityId);
		if (
			entity &&
			entity.campaignId === campaignId &&
			entity.entityType === "locations"
		) {
			return entity;
		}
	}
	if (!locationHint) return null;
	const matches = await daoFactory.entityDAO.searchEntitiesByName(
		campaignId,
		splitKeywords(locationHint),
		{
			entityType: "locations",
			limit: 5,
		}
	);
	return matches[0] ?? null;
}

async function getRelationshipNameMap(params: {
	daoFactory: ReturnType<typeof getDAOFactory>;
	relsByMonster: Map<string, EntityRelationship[]>;
}): Promise<Map<string, string>> {
	const { daoFactory, relsByMonster } = params;
	const relatedEntityIds = new Set<string>();
	for (const rels of relsByMonster.values()) {
		for (const rel of rels) {
			relatedEntityIds.add(rel.fromEntityId);
			relatedEntityIds.add(rel.toEntityId);
		}
	}
	const entities = await daoFactory.entityDAO.getEntitiesByIds(
		Array.from(relatedEntityIds)
	);
	return new Map(entities.map((entity) => [entity.id, entity.name]));
}

export const generateEncounterTool = tool({
	description:
		"Generate a campaign-grounded encounter spec from entity graph context, location signals, and party difficulty targets.",
	inputSchema: generateEncounterSchema,
	execute: async (
		input: z.infer<typeof generateEncounterSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for encounter generation.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;

			const gmError = await requireGMRole(
				env,
				input.campaignId,
				userId,
				toolCallId
			);
			if (gmError) return gmError;

			const daoFactory = getDAOFactory(env);
			const locationEntity = await resolveLocationEntity({
				campaignId: input.campaignId,
				locationEntityId: input.locationEntityId,
				locationHint: input.locationHint,
				daoFactory,
			});

			const allMonsters = await daoFactory.entityDAO.listEntitiesByCampaign(
				input.campaignId,
				{
					entityType: "monsters",
					excludeShardStatuses: ["staging", "rejected", "deleted"],
					limit: 200,
				}
			);

			if (allMonsters.length === 0) {
				return createToolSuccess(
					"No monster entities are available yet, so I could not build a grounded encounter.",
					{
						encounterSpec: null,
						hint: "Import or create monster entities in campaign context first, then generate again.",
					},
					toolCallId
				);
			}

			let locationNeighborIds = new Set<string>();
			if (locationEntity) {
				const neighbors = await daoFactory.entityGraphService.getNeighbors(
					input.campaignId,
					locationEntity.id,
					{ maxDepth: 2 }
				);
				locationNeighborIds = new Set(
					neighbors.map((neighbor) => neighbor.entityId)
				);
			}

			const planningSignals: string[] = [];
			const { planningContext } = await getPlanningServices(env as any);
			if (planningContext) {
				const planningResults = await planningContext.search({
					campaignId: input.campaignId,
					query: `${input.locationHint ?? locationEntity?.name ?? ""} ${input.theme ?? ""} encounter`,
					limit: 6,
					applyRecencyWeighting: true,
				});
				for (const result of planningResults) {
					planningSignals.push(formatPlanningSignal(result));
				}
			}

			const relsByMonster =
				await daoFactory.entityGraphService.getRelationshipsForEntities(
					input.campaignId,
					allMonsters.map((monster) => monster.id)
				);
			const nameMap = await getRelationshipNameMap({
				daoFactory,
				relsByMonster,
			});

			const themeWords = toWordSet(input.theme);
			const locationWords = toWordSet(
				`${input.locationHint ?? ""} ${locationEntity?.name ?? ""}`
			);

			const scored = allMonsters
				.map((monster) => {
					const monsterText =
						`${monster.name} ${getEntityText(monster)}`.toLowerCase();
					const rels = relsByMonster.get(monster.id) ?? [];
					let score = 1;

					for (const word of themeWords) {
						if (monsterText.includes(word)) score += 2;
					}
					for (const word of locationWords) {
						if (monsterText.includes(word)) score += 1;
					}

					if (locationNeighborIds.has(monster.id)) score += 6;
					if (locationEntity) {
						for (const rel of rels) {
							const peerId =
								rel.fromEntityId === monster.id
									? rel.toEntityId
									: rel.fromEntityId;
							if (peerId === locationEntity.id) score += 8;
						}
					}

					const threatBand = inferThreatBand(monster);
					if (input.partyLevel <= 4 && threatBand === "high") score -= 2;
					if (input.partyLevel >= 11 && threatBand === "low") score -= 1;

					return { monster, score, rels, threatBand };
				})
				.sort((a, b) => b.score - a.score);

			const preferred = scored.slice(0, 20);
			const selected: Array<{
				monster: Entity;
				rels: EntityRelationship[];
				threatBand: "low" | "standard" | "high";
			}> = [];
			const slots = getDifficultySlots(input.targetDifficulty, input.partySize);

			for (const band of ["high", "standard", "low"] as const) {
				const required = slots[band];
				if (required <= 0) continue;
				const pool = preferred.filter((item) => item.threatBand === band);
				for (const candidate of pool) {
					if (selected.length >= 6) break;
					if (
						selected.some((pick) => pick.monster.id === candidate.monster.id)
					) {
						continue;
					}
					selected.push(candidate);
					if (
						selected.filter((pick) => pick.threatBand === band).length >=
						required
					) {
						break;
					}
				}
			}

			if (selected.length === 0) {
				selected.push(...preferred.slice(0, 3));
			}

			const composition = selected.slice(0, 6).map((pick) => {
				const countByBand =
					pick.threatBand === "high"
						? 1
						: pick.threatBand === "standard"
							? Math.max(1, Math.floor(input.partySize / 2))
							: Math.max(2, Math.floor(input.partySize * 0.75));
				const rels = pick.rels;
				const linkedFactions = rels
					.filter((rel) => rel.relationshipType.includes("faction"))
					.map((rel) => {
						const peerId =
							rel.fromEntityId === pick.monster.id
								? rel.toEntityId
								: rel.fromEntityId;
						return nameMap.get(peerId) ?? peerId;
					})
					.slice(0, 3);

				const linkedLocations = rels
					.filter((rel) => {
						const type = rel.relationshipType.toLowerCase();
						return (
							type.includes("location") ||
							type.includes("resides") ||
							type.includes("inhabits")
						);
					})
					.map((rel) => {
						const peerId =
							rel.fromEntityId === pick.monster.id
								? rel.toEntityId
								: rel.fromEntityId;
						return nameMap.get(peerId) ?? peerId;
					})
					.slice(0, 3);

				const role = inferRole(pick.monster);
				return {
					entityId: pick.monster.id,
					name: pick.monster.name,
					entityType: pick.monster.entityType,
					count: countByBand,
					role,
					threatEstimate: pick.threatBand,
					linkedFactions,
					linkedLocations,
					gmUsageAdvice: buildRoleBasedUsageAdvice({
						role,
						threatBand: pick.threatBand,
						linkedFactions,
						linkedLocations,
					}),
					synergyNotes:
						linkedFactions.length > 0
							? `Connected to ${linkedFactions.join(", ")}.`
							: "No direct faction links found; use as independent actors.",
				};
			});

			const terrainBase =
				locationEntity?.name ?? input.locationHint ?? "the current area";
			const encounterSpec = {
				encounterSummary: `A ${input.targetDifficulty} encounter near ${terrainBase}, built from current campaign entities and graph relationships.`,
				recommendedParty: {
					level: input.partyLevel,
					size: input.partySize,
				},
				targetDifficulty: input.targetDifficulty,
				location: locationEntity
					? {
							entityId: locationEntity.id,
							name: locationEntity.name,
							reasoning:
								"Selected from location anchor and nearby graph relationships.",
						}
					: {
							entityId: null,
							name: terrainBase,
							reasoning:
								"Built from location hint and campaign context because no explicit location entity was resolved.",
						},
				composition,
				environment: {
					terrainFeatures: [
						`Choke points and approach lanes around ${terrainBase}`,
						"At least one vertical or cover-heavy position",
						"A secondary route that allows flanking or retreat",
					],
					hazards: [
						"Escalating pressure after 3 rounds (reinforcements, collapse, or hazard trigger)",
						"One interactable environmental threat tied to local fiction",
					],
					dynamicElements: [
						"A non-combat objective that can shift encounter pacing",
						"A social or morale breakpoint where enemies may bargain, flee, or surrender",
					],
				},
				tactics: {
					openingMoves: [
						"Lead with scouts or ranged pressure to test party positioning.",
						"Reveal the strongest threat after players commit to a lane.",
					],
					midFightTwists: [
						"Introduce a context-driven complication (alarm, weather shift, or ritual progress).",
						"Have one enemy group change objective from kill to delay or extraction.",
					],
					retreatOrResolve: [
						"Survivors retreat if leader falls or objective is lost.",
						"Offer consequences-rich surrender terms to preserve campaign continuity.",
					],
				},
				narrativeHooks: [
					"A discovered clue links the encounter to an active campaign thread.",
					"A survivor, token, or document points to the next location or faction.",
					"The battlefield aftermath changes local world state in a visible way.",
				],
				generalCombatAdvice: buildGeneralCombatAdvice({
					targetDifficulty: input.targetDifficulty,
					partySize: input.partySize,
					composition,
				}),
				difficultyAssessment: {
					target: input.targetDifficulty,
					method: "system-agnostic party size and threat-band composition",
					rationale: [
						`Party size ${input.partySize} and level ${input.partyLevel} influenced enemy count mix.`,
						"Threat bands estimated from monster metadata/text cues rather than ruleset-specific CR math.",
					],
				},
				sourceContext: {
					seedEntityIds: [
						...(locationEntity ? [locationEntity.id] : []),
						...composition.map((entry) => entry.entityId),
					],
					planningSignals,
				},
			};

			return createToolSuccess(
				`Generated a ${input.targetDifficulty} encounter grounded in current campaign context.`,
				{
					encounterSpec,
					candidateMonstersConsidered: allMonsters.length,
					locationResolved: locationEntity ? locationEntity.name : null,
				},
				toolCallId,
				input.campaignId,
				campaign.name
			);
		} catch (error) {
			console.error("[generateEncounterTool] Error:", error);
			return createToolError(
				"Failed to generate encounter",
				error instanceof Error ? error.message : "Unknown error",
				500,
				options?.toolCallId ?? crypto.randomUUID()
			);
		}
	},
});

export const scaleEncounterTool = tool({
	description:
		"Scale an existing encounter spec up or down for a new target difficulty and party profile.",
	inputSchema: scaleEncounterSchema,
	execute: async (
		input: z.infer<typeof scaleEncounterSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for encounter scaling.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;
			const gmError = await requireGMRole(
				env,
				input.campaignId,
				userId,
				toolCallId
			);
			if (gmError) return gmError;

			const source = input.encounterSpec;
			const originalDifficulty = (() => {
				if (source.composition.length <= 2) return "easy" as Difficulty;
				if (source.composition.length <= 3) return "medium" as Difficulty;
				if (source.composition.length <= 5) return "hard" as Difficulty;
				return "deadly" as Difficulty;
			})();

			const steps =
				DIFFICULTY_RANK[input.targetDifficulty] -
				DIFFICULTY_RANK[originalDifficulty];
			const effectivePartyLevel =
				input.partyLevel ?? source.recommendedParty?.level ?? 5;
			const effectivePartySize =
				input.partySize ?? source.recommendedParty?.size ?? 4;

			const composition = source.composition.map((entry) => {
				const threat = (entry.threatEstimate ?? "standard").toLowerCase();
				const highThreat = threat === "high";
				const lowThreat = threat === "low";
				const scaleSteps = highThreat
					? Math.max(-1, steps)
					: lowThreat
						? steps + 1
						: steps;
				return {
					...entry,
					count: bumpCount(entry.count, scaleSteps),
					gmUsageAdvice:
						entry.gmUsageAdvice && entry.gmUsageAdvice.length > 0
							? entry.gmUsageAdvice
							: buildRoleBasedUsageAdvice({
									role: entry.role ?? "general combatant",
									threatBand: highThreat
										? "high"
										: lowThreat
											? "low"
											: "standard",
									linkedFactions: [],
									linkedLocations: [],
								}),
				};
			});

			const scaledEncounterSpec = {
				...source,
				encounterSummary:
					source.encounterSummary ??
					"Scaled encounter specification based on target difficulty.",
				targetDifficulty: input.targetDifficulty,
				recommendedParty: {
					level: effectivePartyLevel,
					size: effectivePartySize,
				},
				composition,
				generalCombatAdvice: buildGeneralCombatAdvice({
					targetDifficulty: input.targetDifficulty,
					partySize: effectivePartySize,
					composition,
				}),
				difficultyAssessment: {
					target: input.targetDifficulty,
					method: "system-agnostic scaling",
					rationale: [
						`Adjusted counts by ${steps >= 0 ? `+${steps}` : steps} difficulty step(s).`,
						"High-threat units scale more conservatively; low-threat units absorb most count changes.",
					],
				},
			};

			return createToolSuccess(
				`Scaled encounter to ${input.targetDifficulty} difficulty for party level ${effectivePartyLevel}.`,
				{
					originalDifficultyGuess: originalDifficulty,
					targetDifficulty: input.targetDifficulty,
					changeSummary: {
						compositionCountBefore: source.composition.reduce(
							(sum, item) => sum + item.count,
							0
						),
						compositionCountAfter: composition.reduce(
							(sum, item) => sum + item.count,
							0
						),
					},
					scaledEncounterSpec,
				},
				toolCallId,
				input.campaignId,
				campaign.name
			);
		} catch (error) {
			console.error("[scaleEncounterTool] Error:", error);
			return createToolError(
				"Failed to scale encounter",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});

export const getEncounterStatBlocksTool = tool({
	description:
		"Lookup stat block excerpts for creatures in an encounter, returning grouped citations per creature.",
	inputSchema: getEncounterStatBlocksSchema,
	execute: async (
		input: z.infer<typeof getEncounterStatBlocksSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();
		try {
			const env = getEnvFromContext(options);
			if (!env) {
				return createToolError(
					"Environment not available",
					"Direct database access is required for encounter stat block lookup.",
					500,
					toolCallId
				);
			}

			const access = await requireCampaignAccessForTool({
				env,
				campaignId: input.campaignId,
				jwt: input.jwt,
				toolCallId,
			});
			if ("toolCallId" in access) return access;
			const { userId, campaign } = access;
			const gmError = await requireGMRole(
				env,
				input.campaignId,
				userId,
				toolCallId
			);
			if (gmError) return gmError;

			const aggregated: Array<{
				name: string;
				entityId?: string;
				matches: unknown[];
				message: string;
			}> = [];

			for (const creature of input.creatures) {
				const delegated = (await (
					lookupStatBlockTool as unknown as {
						execute: (
							args: {
								campaignId: string;
								name: string;
								limit: number;
								jwt: string | null | undefined;
							},
							opts?: ToolExecuteOptions
						) => Promise<ToolResult>;
					}
				).execute(
					{
						campaignId: input.campaignId,
						name: creature.name,
						limit: input.limitPerCreature,
						jwt: input.jwt,
					},
					options
				)) as ToolResult;

				const payload = delegated.result?.data as
					| { results?: unknown[]; message?: string }
					| undefined;
				aggregated.push({
					name: creature.name,
					entityId: creature.entityId,
					matches: payload?.results ?? [],
					message:
						delegated.result?.message ?? payload?.message ?? "No message",
				});
			}

			const matchedCount = aggregated.filter(
				(entry) => entry.matches.length > 0
			).length;

			return createToolSuccess(
				`Resolved stat block references for ${matchedCount}/${aggregated.length} encounter creature(s).`,
				{
					results: aggregated,
					matchedCount,
					totalRequested: aggregated.length,
				},
				toolCallId,
				input.campaignId,
				campaign.name
			);
		} catch (error) {
			console.error("[getEncounterStatBlocksTool] Error:", error);
			return createToolError(
				"Failed to lookup encounter stat blocks",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});
