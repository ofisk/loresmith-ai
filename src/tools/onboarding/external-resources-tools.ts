import { tool } from "ai";
import { z } from "zod";
import type { ToolRecommendation } from "./state-analysis-tools";
import { createToolError, createToolSuccess } from "../utils";

/**
 * Tool: Recommend external tools based on user needs
 */
export const recommendExternalTools = tool({
  description: "Recommend external tools and resources based on user needs",
  parameters: z.object({
    userNeeds: z
      .array(z.string())
      .describe(
        "Array of user needs (e.g., ['maps', 'adventures', 'community'])"
      ),
  }),
  execute: async ({ userNeeds }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

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
        "External tools recommended successfully",
        { tools },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to recommend external tools:", error);
      return createToolError(
        "Failed to generate tool recommendations",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Suggest inspiration sources for campaign building
 */
export const suggestInspirationSources = tool({
  description: "Suggest inspiration sources for campaign building",
  parameters: z.object({
    campaignType: z
      .string()
      .optional()
      .describe("Type of campaign (e.g., 'horror', 'fantasy')"),
  }),
  execute: async ({ campaignType }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      const sources: ToolRecommendation[] = [];

      // General inspiration sources
      sources.push(
        {
          name: "Pinterest - D&D Maps",
          url: "https://www.pinterest.com/search/pins/?q=dnd%20maps",
          description: "Find battlemaps and world maps",
          category: "inspiration",
          relevance: "high",
        },
        {
          name: "Pinterest - Character Art",
          url: "https://www.pinterest.com/search/pins/?q=fantasy%20character%20art",
          description: "Discover character portraits and designs",
          category: "inspiration",
          relevance: "high",
        },
        {
          name: "YouTube - D&D Campaign Ideas",
          url: "https://www.youtube.com/results?search_query=dnd+campaign+ideas",
          description: "Watch videos for campaign inspiration",
          category: "content",
          relevance: "high",
        }
      );

      // Campaign-specific sources
      if (campaignType === "horror") {
        sources.push(
          {
            name: "Pinterest - Gothic Horror",
            url: "https://www.pinterest.com/search/pins/?q=gothic%20horror",
            description: "Find gothic and horror inspiration",
            category: "inspiration",
            relevance: "high",
          },
          {
            name: "YouTube - Horror RPG",
            url: "https://www.youtube.com/results?search_query=horror+rpg",
            description: "Learn horror RPG techniques",
            category: "content",
            relevance: "high",
          }
        );
      } else if (campaignType === "fantasy") {
        sources.push(
          {
            name: "Pinterest - Fantasy Landscapes",
            url: "https://www.pinterest.com/search/pins/?q=fantasy%20landscape",
            description: "Find fantasy world inspiration",
            category: "inspiration",
            relevance: "high",
          },
          {
            name: "YouTube - Fantasy World Building",
            url: "https://www.youtube.com/results?search_query=fantasy+world+building",
            description: "Learn world building techniques",
            category: "content",
            relevance: "high",
          }
        );
      }

      return createToolSuccess(
        "Inspiration sources suggested successfully",
        { sources },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to suggest inspiration sources:", error);
      return createToolError(
        "Failed to generate inspiration suggestions",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool: Recommend GM-specific resources and tools
 */
export const recommendGMResources = tool({
  description:
    "Recommend GM-specific resources and tools based on experience level",
  parameters: z.object({
    experienceLevel: z
      .enum(["beginner", "intermediate", "advanced"])
      .describe("GM experience level"),
  }),
  execute: async ({ experienceLevel }, context?: any): Promise<any> => {
    const toolCallId = context?.toolCallId || "unknown";

    try {
      const resources: ToolRecommendation[] = [];

      // Core GM resources for all levels
      resources.push(
        {
          name: "D&D Beyond",
          url: "https://www.dndbeyond.com",
          description: "Official D&D tools and content",
          category: "tools",
          relevance: "high",
        },
        {
          name: "DMsGuild",
          url: "https://www.dmsguild.com",
          description: "Find adventures and supplements",
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

      // Beginner-specific resources
      if (experienceLevel === "beginner") {
        resources.push(
          {
            name: "YouTube - Matt Colville",
            url: "https://www.youtube.com/c/mattcolville",
            description: "Excellent DM advice for beginners",
            category: "content",
            relevance: "high",
          },
          {
            name: "YouTube - Dungeon Dudes",
            url: "https://www.youtube.com/c/DungeonDudes",
            description: "Beginner-friendly D&D content",
            category: "content",
            relevance: "high",
          },
          {
            name: "D&D Starter Set",
            url: "https://dnd.wizards.com/products/starter-set",
            description: "Perfect for new DMs",
            category: "content",
            relevance: "high",
          }
        );
      }

      // Intermediate resources
      if (experienceLevel === "intermediate") {
        resources.push(
          {
            name: "YouTube - Critical Role",
            url: "https://www.youtube.com/c/CriticalRole",
            description: "Watch professional DMs in action",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DnDBehindTheScreen",
            url: "https://www.reddit.com/r/DnDBehindTheScreen/",
            description: "Advanced DM techniques and resources",
            category: "community",
            relevance: "high",
          },
          {
            name: "Kobold Press",
            url: "https://koboldpress.com",
            description: "High-quality third-party content",
            category: "content",
            relevance: "high",
          }
        );
      }

      // Advanced resources
      if (experienceLevel === "advanced") {
        resources.push(
          {
            name: "YouTube - Sly Flourish",
            url: "https://www.youtube.com/c/SlyFlourish",
            description: "Advanced DM techniques and prep",
            category: "content",
            relevance: "high",
          },
          {
            name: "Reddit - r/DnDBehindTheScreen",
            url: "https://www.reddit.com/r/DnDBehindTheScreen/",
            description: "Advanced DM techniques and resources",
            category: "community",
            relevance: "high",
          },
          {
            name: "DriveThruRPG",
            url: "https://www.drivethrurpg.com",
            description: "Extensive RPG content library",
            category: "content",
            relevance: "high",
          }
        );
      }

      return createToolSuccess(
        "GM resources recommended successfully",
        { resources },
        toolCallId
      );
    } catch (error) {
      console.error("Failed to recommend GM resources:", error);
      return createToolError(
        "Failed to generate GM resource recommendations",
        { error: error instanceof Error ? error.message : String(error) },
        500,
        toolCallId
      );
    }
  },
});
