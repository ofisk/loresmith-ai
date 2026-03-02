import type { Entity } from "@/dao/entity-dao";

export const HANDOUT_FORMATS = [
	"prose",
	"rumor",
	"letter",
	"notice",
	"tavern_gossip",
] as const;

export type HandoutFormat = (typeof HANDOUT_FORMATS)[number];

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}...`;
}

function jsonString(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "{}";
	}
}

export function summarizePlayerSafeEntity(
	entity: Entity,
	playerSafeContent: Record<string, unknown>
): string {
	const metadata =
		entity.metadata &&
		typeof entity.metadata === "object" &&
		!Array.isArray(entity.metadata)
			? entity.metadata
			: {};

	const summary = {
		id: entity.id,
		name: entity.name,
		entityType: entity.entityType,
		content: playerSafeContent,
		metadata,
	};

	return truncate(jsonString(summary), 8000);
}

function formatInstructions(format: HandoutFormat): string {
	switch (format) {
		case "prose":
			return "Write one polished player-facing paragraph (120-220 words).";
		case "rumor":
			return "Write 5-8 short rumor snippets suitable for player discovery at the table.";
		case "letter":
			return "Write an in-world letter with salutation and signature suitable for players to receive.";
		case "notice":
			return "Write a public notice or bulletin board posting in-world.";
		case "tavern_gossip":
			return "Write lively tavern gossip blurbs that imply atmosphere and hooks without revealing secrets.";
		default:
			return "Write player-facing handout content.";
	}
}

export function buildGenerateHandoutPrompt(params: {
	campaignName: string;
	format: HandoutFormat;
	entitySummary: string;
	userTone?: string;
	targetLength?: string;
}): string {
	const tone = params.userTone?.trim() || "grounded fantasy";
	const targetLength = params.targetLength?.trim() || "medium";
	const formatInstruction = formatInstructions(params.format);

	return `
You generate player-facing tabletop RPG handouts.
Return valid JSON only.

Safety rules:
- Use only the source data provided below.
- Do not invent GM-only secrets, hidden motives, unrevealed villains, trap solutions, puzzle solutions, or future twists.
- If a detail is not clearly player-facing in the source data, omit it.

Campaign: ${params.campaignName}
Requested format: ${params.format}
Tone: ${tone}
Target length: ${targetLength}

Source entity (already sanitized for player view):
${params.entitySummary}

${formatInstruction}

Return JSON with shape:
{
  "title": "string",
  "content": "string",
  "format": "prose|rumor|letter|notice|tavern_gossip",
  "safetyNotes": ["string"]
}
`.trim();
}

export function renderHandoutMarkdown(params: {
	title: string;
	content: string;
	format: HandoutFormat;
	entityName: string;
}): string {
	return `# ${params.title}

_Format: ${params.format.replaceAll("_", " ")}_  
_Source: ${params.entityName}_

${params.content}
`;
}

export function renderHandoutText(params: {
	title: string;
	content: string;
	format: HandoutFormat;
	entityName: string;
}): string {
	return `${params.title}
Format: ${params.format.replaceAll("_", " ")}
Source: ${params.entityName}

${params.content}
`;
}
