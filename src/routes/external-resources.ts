import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  get(key: "userAuth"): AuthPayload;
};

// Get external resource recommendations
export async function handleGetExternalResourceRecommendations(
  c: ContextWithAuth
) {
  try {
    const { campaignType: _campaignType, userPreferences: _userPreferences } =
      await c.req.json();

    // This would typically fetch from a database or external API
    const recommendations = [
      {
        type: "book",
        title: "Dungeon Master's Guide",
        description: "Essential resource for DMs",
        url: "https://dnd.wizards.com/products/tabletop-games/rpg-products/dungeon-masters-guide",
        relevance: "high",
      },
      {
        type: "website",
        title: "D&D Beyond",
        description: "Digital tools for D&D",
        url: "https://www.dndbeyond.com",
        relevance: "medium",
      },
    ];

    return c.json({ recommendations });
  } catch (error) {
    console.error("Error getting external resource recommendations:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get external resource search results
export async function handleGetExternalResourceSearch(c: ContextWithAuth) {
  try {
    const { query, resourceType: _resourceType } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    // This would typically search external APIs or databases
    const searchResults = [
      {
        title: "Monster Manual",
        description: "Comprehensive guide to D&D monsters",
        url: "https://dnd.wizards.com/products/tabletop-games/rpg-products/monster-manual",
        type: "book",
        relevance: 0.95,
      },
      {
        title: "Player's Handbook",
        description: "Core rules for D&D players",
        url: "https://dnd.wizards.com/products/tabletop-games/rpg-products/players-handbook",
        type: "book",
        relevance: 0.85,
      },
    ];

    return c.json({ searchResults });
  } catch (error) {
    console.error("Error searching external resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get GM-specific resources
export async function handleGetGmResources(c: ContextWithAuth) {
  try {
    // This would typically fetch GM-specific resources
    const gmResources = [
      {
        category: "Campaign Planning",
        resources: [
          {
            title: "Campaign Planning Template",
            description: "A structured template for planning campaigns",
            url: "https://example.com/campaign-template",
            type: "template",
          },
        ],
      },
      {
        category: "World Building",
        resources: [
          {
            title: "World Building Guide",
            description: "Comprehensive guide to creating game worlds",
            url: "https://example.com/world-building",
            type: "guide",
          },
        ],
      },
    ];

    return c.json({ gmResources });
  } catch (error) {
    console.error("Error getting GM resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
