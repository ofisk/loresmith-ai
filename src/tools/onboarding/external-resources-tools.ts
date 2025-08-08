import { tool } from "ai";
import { z } from "zod";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import type { ToolRecommendation } from "./state-analysis-tools";

/**
 * Tool: Recommend external tools based on user needs
 */
export const recommendExternalToolsTool = tool({
  description: "Recommend external tools based on user needs",
  parameters: z.object({
    userNeeds: z
      .array(z.string())
      .describe("Array of user needs to recommend tools for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ userNeeds, jwt: _jwt }, context?: any) => {
    try {
      const tools: ToolRecommendation[] = [];

      // Always include core GM tools
      tools.push(
        {
          name: "DMsGuild",
          url: "https://www.dmsguild.com",
          description: "Find adventures, supplements, and campaign resources",
          category: "content",
          relevance: "high",
        },
        {
          name: "D&D Beyond",
          url: "https://www.dndbeyond.com",
          description: "Access official D&D content and tools",
          category: "tools",
          relevance: "high",
        },
        {
          name: "Pinterest",
          url: "https://www.pinterest.com",
          description: "Discover maps, character art, and campaign inspiration",
          category: "inspiration",
          relevance: "high",
        }
      );

      // Add specific tools based on user needs
      if (userNeeds.includes("maps")) {
        tools.push(
          {
            name: "Dungeon Scrawl",
            url: "https://dungeonscrawl.com",
            description: "Create beautiful dungeon maps",
            category: "tools",
            relevance: "high",
          },
          {
            name: "Inkarnate",
            url: "https://inkarnate.com",
            description: "Create fantasy maps and battlemaps",
            category: "tools",
            relevance: "high",
          }
        );
      }

      if (userNeeds.includes("adventures")) {
        tools.push(
          {
            name: "Adventure Lookup",
            url: "https://adventurelookup.com",
            description: "Find adventures by criteria",
            category: "content",
            relevance: "high",
          },
          {
            name: "DriveThruRPG",
            url: "https://www.drivethrurpg.com",
            description: "Find RPG content and adventures",
            category: "content",
            relevance: "high",
          }
        );
      }

      if (userNeeds.includes("community")) {
        tools.push(
          {
            name: "Reddit - r/DMAcademy",
            url: "https://www.reddit.com/r/DMAcademy/",
            description: "Get advice from experienced DMs",
            category: "community",
            relevance: "high",
          },
          {
            name: "Reddit - r/DnD",
            url: "https://www.reddit.com/r/DnD/",
            description: "D&D community and discussions",
            category: "community",
            relevance: "medium",
          }
        );
      }

      if (userNeeds.includes("inspiration")) {
        tools.push(
          {
            name: "ArtStation",
            url: "https://www.artstation.com",
            description: "Find character art and concept art",
            category: "inspiration",
            relevance: "high",
          },
          {
            name: "DeviantArt",
            url: "https://www.deviantart.com",
            description: "Discover fantasy art and character designs",
            category: "inspiration",
            relevance: "medium",
          }
        );
      }

      return createToolSuccess(
        `External tools recommended successfully for needs: ${userNeeds.join(", ")}`,
        tools,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to recommend external tools:", error);
      return createToolError(
        "Failed to recommend external tools",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Suggest inspiration sources based on campaign type
 */
export const suggestInspirationSourcesTool = tool({
  description: "Suggest inspiration sources based on campaign type",
  parameters: z.object({
    campaignType: z
      .string()
      .optional()
      .describe("The type of campaign to suggest sources for"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignType, jwt: _jwt }, context?: any) => {
    try {
      const sources: ToolRecommendation[] = [];

      // Add general inspiration sources
      sources.push(
        {
          name: "Pinterest - Fantasy Art",
          url: "https://www.pinterest.com/search/pins/?q=fantasy%20art",
          description: "Discover fantasy artwork and character designs",
          category: "inspiration",
          relevance: "high",
        },
        {
          name: "ArtStation - Concept Art",
          url: "https://www.artstation.com/search?q=concept%20art",
          description: "Find professional concept art and designs",
          category: "inspiration",
          relevance: "high",
        },
        {
          name: "Reddit - r/ImaginaryCharacters",
          url: "https://www.reddit.com/r/ImaginaryCharacters/",
          description: "Character art and designs",
          category: "inspiration",
          relevance: "medium",
        }
      );

      // Add campaign-specific sources
      if (campaignType === "fantasy") {
        sources.push(
          {
            name: "Reddit - r/ImaginaryLandscapes",
            url: "https://www.reddit.com/r/ImaginaryLandscapes/",
            description: "Fantasy landscapes and environments",
            category: "inspiration",
            relevance: "high",
          },
          {
            name: "Reddit - r/ImaginaryMonsters",
            url: "https://www.reddit.com/r/ImaginaryMonsters/",
            description: "Monster and creature designs",
            category: "inspiration",
            relevance: "high",
          }
        );
      } else if (campaignType === "sci-fi") {
        sources.push(
          {
            name: "Reddit - r/ImaginaryTechnology",
            url: "https://www.reddit.com/r/ImaginaryTechnology/",
            description: "Sci-fi technology and designs",
            category: "inspiration",
            relevance: "high",
          },
          {
            name: "Reddit - r/ImaginaryStarships",
            url: "https://www.reddit.com/r/ImaginaryStarships/",
            description: "Spaceship and vehicle designs",
            category: "inspiration",
            relevance: "high",
          }
        );
      }

      return createToolSuccess(
        `Inspiration sources suggested successfully for campaign type: ${campaignType || "general"}`,
        sources,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to suggest inspiration sources:", error);
      return createToolError(
        "Failed to suggest inspiration sources",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});

/**
 * Tool: Recommend GM resources based on experience level
 */
export const recommendGMResourcesTool = tool({
  description: "Recommend GM resources based on experience level",
  parameters: z.object({
    experienceLevel: z
      .enum(["beginner", "intermediate", "advanced"])
      .describe("The GM's experience level"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ experienceLevel, jwt: _jwt }, context?: any) => {
    try {
      const resources: ToolRecommendation[] = [];

      // Add resources based on experience level
      if (experienceLevel === "beginner") {
        resources.push(
          {
            name: "D&D Beyond - Basic Rules",
            url: "https://www.dndbeyond.com/sources/basic-rules",
            description: "Free basic rules for D&D 5e",
            category: "content",
            relevance: "high",
          },
          {
            name: "YouTube - Matt Colville",
            url: "https://www.youtube.com/c/mattcolville",
            description: "Excellent GM advice for beginners",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DMAcademy",
            url: "https://www.reddit.com/r/DMAcademy/",
            description: "Get advice from experienced DMs",
            category: "community",
            relevance: "high",
          }
        );
      } else if (experienceLevel === "intermediate") {
        resources.push(
          {
            name: "DMsGuild - Adventures",
            url: "https://www.dmsguild.com/browse.php?keywords=adventure",
            description: "Find adventures to run or adapt",
            category: "content",
            relevance: "high",
          },
          {
            name: "YouTube - Dungeon Craft",
            url: "https://www.youtube.com/c/DungeonCraft",
            description: "Advanced GM techniques and tips",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DnDBehindTheScreen",
            url: "https://www.reddit.com/r/DnDBehindTheScreen/",
            description: "Advanced DM resources and discussions",
            category: "community",
            relevance: "high",
          }
        );
      } else if (experienceLevel === "advanced") {
        resources.push(
          {
            name: "DriveThruRPG - Third Party Content",
            url: "https://www.drivethrurpg.com/browse.php?keywords=third+party",
            description: "Advanced third-party content and supplements",
            category: "content",
            relevance: "high",
          },
          {
            name: "YouTube - Taking20",
            url: "https://www.youtube.com/c/Taking20",
            description: "Advanced GM strategies and analysis",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DnDBehindTheScreen",
            url: "https://www.reddit.com/r/DnDBehindTheScreen/",
            description: "Advanced DM resources and discussions",
            category: "community",
            relevance: "high",
          }
        );
      }

      return createToolSuccess(
        `GM resources recommended successfully for experience level: ${experienceLevel}`,
        resources,
        context?.toolCallId || "unknown"
      );
    } catch (error) {
      console.error("Failed to recommend GM resources:", error);
      return createToolError(
        "Failed to recommend GM resources",
        error instanceof Error ? error.message : "Unknown error",
        500,
        context?.toolCallId || "unknown"
      );
    }
  },
});
