import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import type { Env } from "@/middleware/auth";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** Max concurrent AI requests to stay within Cloudflare Workers AI limits */
const AI_CONCURRENCY_LIMIT = 8;

const CONTENT_TYPES = [
	"monsters",
	"npcs",
	"spells",
	"items",
	"traps",
	"hazards",
	"conditions",
	"vehicles",
	"env_effects",
	"hooks",
	"plot_lines",
	"quests",
	"scenes",
	"locations",
	"lairs",
	"factions",
	"deities",
	"backgrounds",
	"feats",
	"subclasses",
	"rules",
	"downtime",
	"tables",
	"encounter_tables",
	"treasure_tables",
	"maps",
	"handouts",
	"puzzles",
	"timelines",
	"travel",
] as const;

/**
 * Service for searching RPG content in library files using AI
 */
export class LibraryContentSearchService {
	constructor(private env: Env) {}

	/**
	 * Search for RPG content in library files using AI
	 */
	async searchContent(query: string): Promise<any[]> {
		try {
			if (!this.env.AI) {
				return [];
			}

			const allResults: any[] = [];

			// Query content types with bounded concurrency to avoid Cloudflare AI limits
			const settled: PromiseSettledResult<{
				contentType: (typeof CONTENT_TYPES)[number];
				aiResponse: unknown;
			}>[] = new Array(CONTENT_TYPES.length);
			let nextIndex = 0;
			const numWorkers = Math.min(AI_CONCURRENCY_LIMIT, CONTENT_TYPES.length);
			const workers = Array.from({ length: numWorkers }, async () => {
				while (true) {
					const i = nextIndex++;
					if (i >= CONTENT_TYPES.length) return;
					const contentType = CONTENT_TYPES[i];
					try {
						const typeSpecificPrompt =
							RPG_EXTRACTION_PROMPTS.getTypeSpecificExtractionPrompt(
								contentType
							);
						const aiResponse = await this.env.AI!.run(LLM_MODEL, {
							messages: [
								{ role: "system", content: typeSpecificPrompt },
								{ role: "user", content: query },
							],
							max_tokens: 2000,
							temperature: 0.1,
						});
						settled[i] = {
							status: "fulfilled",
							value: { contentType, aiResponse },
						};
					} catch (error) {
						settled[i] = { status: "rejected", reason: error };
					}
				}
			});
			await Promise.all(workers);

			for (let i = 0; i < settled.length; i++) {
				const result = settled[i];
				const contentType = CONTENT_TYPES[i];
				if (result.status === "rejected") {
					continue;
				}
				const { aiResponse } = result.value;

				const responseText = (aiResponse as any).response as string;

				const cleanResponse = this.cleanJsonResponse(responseText);

				try {
					const parsedContent = JSON.parse(cleanResponse);
					if (
						parsedContent[contentType] &&
						Array.isArray(parsedContent[contentType])
					) {
						parsedContent[contentType].forEach((item: any, index: number) => {
							if (item && typeof item === "object") {
								allResults.push({
									id: item.id || `${contentType}_${index}_${Date.now()}`,
									score: 0.9 - index * 0.01,
									metadata: {
										entityType: contentType,
										...item,
									},
									text:
										item.summary ||
										item.description ||
										item.name ||
										JSON.stringify(item),
								});
							}
						});
					}
				} catch (_parseError) {}
			}
			return allResults;
		} catch (_error) {
			return [];
		}
	}

	/**
	 * Clean JSON response by removing markdown formatting
	 */
	private cleanJsonResponse(responseText: string): string {
		let cleanResponse = responseText;
		if (responseText.includes("```json")) {
			cleanResponse = responseText
				.replace(/```json\n?/g, "")
				.replace(/```\n?/g, "")
				.trim();
		} else if (responseText.includes("```")) {
			cleanResponse = responseText.replace(/```\n?/g, "").trim();
		}

		// Extract only the JSON part
		const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			cleanResponse = jsonMatch[0];
		}

		return cleanResponse;
	}
}
