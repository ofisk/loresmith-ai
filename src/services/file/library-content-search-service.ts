import type { Env } from "@/middleware/auth";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

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
      console.log(
        `[LibraryContentSearchService] Searching content with query: ${query}`
      );

      if (!this.env.AI) {
        console.warn(
          `[LibraryContentSearchService] No AI binding available for content generation`
        );
        return [];
      }

      const allResults: any[] = [];

      // Query each content type individually to avoid truncation
      for (const contentType of CONTENT_TYPES) {
        try {
          console.log(
            `[LibraryContentSearchService] Querying for ${contentType}...`
          );

          const typeSpecificPrompt =
            RPG_EXTRACTION_PROMPTS.getTypeSpecificExtractionPrompt(contentType);

          const aiResponse = await this.env.AI.run(LLM_MODEL, {
            messages: [
              {
                role: "system",
                content: typeSpecificPrompt,
              },
              {
                role: "user",
                content: query,
              },
            ],
            max_tokens: 2000,
            temperature: 0.1,
          });

          // Parse the AI response for this content type
          const responseText = aiResponse.response as string;
          console.log(
            `[LibraryContentSearchService] ${contentType} response: ${responseText.substring(0, 200)}...`
          );

          // Clean up the response - remove markdown formatting if present
          const cleanResponse = this.cleanJsonResponse(responseText);

          try {
            const parsedContent = JSON.parse(cleanResponse);
            if (
              parsedContent[contentType] &&
              Array.isArray(parsedContent[contentType])
            ) {
              // Convert to search result format
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
              console.log(
                `[LibraryContentSearchService] Extracted ${parsedContent[contentType].length} ${contentType}`
              );
            }
          } catch (parseError) {
            console.warn(
              `[LibraryContentSearchService] Failed to parse ${contentType} response:`,
              parseError
            );
            // Continue with other content types
          }
        } catch (typeError) {
          console.warn(
            `[LibraryContentSearchService] Error querying ${contentType}:`,
            typeError
          );
          // Continue with other content types
        }
      }

      console.log(
        `[LibraryContentSearchService] Generated ${allResults.length} total structured content items`
      );
      return allResults;
    } catch (error) {
      console.error(`[LibraryContentSearchService] Search error:`, error);
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
