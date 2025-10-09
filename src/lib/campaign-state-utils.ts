/**
 * Centralized campaign state utilities
 * This file consolidates all campaign state conversion and summary generation logic
 */

/**
 * Convert numerical score to descriptive campaign state
 * Maps scores to encouraging, RPG-themed descriptive states
 */
export function getCampaignState(score: number): string {
  if (score >= 90) {
    return "Legendary";
  } else if (score >= 80) {
    return "Epic-Ready";
  } else if (score >= 70) {
    return "Well-Traveled";
  } else if (score >= 60) {
    return "Flourishing";
  } else if (score >= 50) {
    return "Growing Strong";
  } else if (score >= 40) {
    return "Taking Shape";
  } else if (score >= 30) {
    return "Taking Root";
  } else if (score >= 20) {
    return "Newly Forged";
  } else {
    return "Fresh Start";
  }
}

/**
 * Generate encouraging readiness summary using campaign state
 * Single source of truth for summary generation
 */
export function generateReadinessSummary(
  overallScore: number,
  campaignState: string,
  _priorityAreas: string[]
): string {
  const scoreText = overallScore >= 90 ? "" : ` (${overallScore}/100)`;

  // Note about campaign growth and fluctuating readiness
  const growthNote =
    "\n\nRemember: As you add new NPCs, locations, plot hooks, and other elements, your campaign state may shift to reflect areas needing detail. This is healthy growth—your world is expanding and evolving!";

  if (overallScore >= 90) {
    return `Your campaign is ${campaignState} and ready for epic adventures${scoreText}! All dimensions are well-developed.${growthNote}`;
  } else if (overallScore >= 80) {
    return `Your campaign is ${campaignState} and well-prepared for adventure${scoreText} with room to enhance some areas.${growthNote}`;
  } else if (overallScore >= 60) {
    return `Your campaign is ${campaignState}${scoreText}. Focus on the priority areas to level up your readiness.${growthNote}`;
  } else if (overallScore >= 40) {
    return `Your campaign is ${campaignState}${scoreText}. Every great adventure starts with a single step!${growthNote}`;
  } else {
    return `Your campaign is ${campaignState}${scoreText}. Every legendary journey begins with humble beginnings!${growthNote}`;
  }
}

/**
 * Get state description for additional context
 * Provides encouraging descriptions for each campaign state
 */
export function getCampaignStateDescription(state: string): string {
  const descriptions: Record<string, string> = {
    "Fresh Start":
      "Your campaign is just beginning its journey - perfect for exploring new possibilities!",
    "Newly Forged":
      "Your campaign is taking its first steps into the world - the foundation is being laid.",
    "Taking Root":
      "Your campaign is establishing its foundations - the roots are growing strong.",
    "Taking Shape":
      "Your campaign is developing its identity - the form is becoming clearer.",
    "Growing Strong":
      "Your campaign is building momentum - the growth is steady and encouraging.",
    Flourishing:
      "Your campaign is thriving - the development is robust and promising.",
    "Well-Traveled":
      "Your campaign has matured beautifully - it's ready for complex adventures.",
    "Epic-Ready":
      "Your campaign is prepared for legendary quests - it's in excellent shape.",
    Legendary:
      "Your campaign has achieved legendary status - it's a masterpiece of preparation.",
  };

  return descriptions[state] || "Your campaign continues to evolve and grow.";
}

/**
 * Get next milestone for campaign progression
 * Provides specific, actionable steps to reach the next state
 */
export function getNextMilestone(score: number): {
  threshold: number;
  state: string;
  description: string;
  actionableSteps: string[];
} {
  if (score < 20) {
    return {
      threshold: 20,
      state: "Newly Forged",
      description:
        "Start by adding basic campaign elements to establish your foundation",
      actionableSteps: [
        "Create your first character (player or NPC) with a name and brief description",
        "Upload a campaign resource like an adventure module, map, or reference document",
        "Add a location description for your starting area or town",
      ],
    };
  } else if (score < 30) {
    return {
      threshold: 30,
      state: "Taking Root",
      description:
        "Build on your foundation by adding more diverse campaign elements",
      actionableSteps: [
        "Create 2-3 additional characters with motivations and backgrounds",
        "Add campaign context like world-building notes, house rules, or themes",
        "Upload another resource to expand your reference library",
      ],
    };
  } else if (score < 40) {
    return {
      threshold: 40,
      state: "Taking Shape",
      description:
        "Develop your campaign's unique identity and narrative direction",
      actionableSteps: [
        "Describe 2-3 key locations in detail (taverns, dungeons, cities)",
        "Create NPCs with distinct personalities and connections to your story",
        "Add plot hooks or story beats that tie your campaign elements together",
      ],
    };
  } else if (score < 50) {
    return {
      threshold: 50,
      state: "Growing Strong",
      description:
        "Strengthen your campaign with deeper character development and world details",
      actionableSteps: [
        "Develop relationships between characters (allies, rivals, family)",
        "Add detailed faction descriptions and their goals",
        "Create character sheets for your main NPCs with stats and abilities",
      ],
    };
  } else if (score < 60) {
    return {
      threshold: 60,
      state: "Flourishing",
      description:
        "Enrich your campaign with layered storytelling and diverse content",
      actionableSteps: [
        "Add 5+ more campaign resources for variety and inspiration",
        "Describe environmental details and atmospheric elements",
        "Create interconnected plot lines that reference your existing elements",
      ],
    };
  } else if (score < 70) {
    return {
      threshold: 70,
      state: "Well-Traveled",
      description:
        "Deepen your campaign with complex narratives and detailed world-building",
      actionableSteps: [
        "Develop character arcs and growth paths for main characters",
        "Add historical context and lore to your world",
        "Create detailed encounter tables, treasure lists, or custom mechanics",
      ],
    };
  } else if (score < 80) {
    return {
      threshold: 80,
      state: "Epic-Ready",
      description:
        "Polish your campaign for epic adventures with rich, interconnected content",
      actionableSteps: [
        "Add session notes or planned encounters for upcoming games",
        "Create detailed maps with points of interest and secrets",
        "Develop major story conflicts and their resolution paths",
      ],
    };
  } else if (score < 90) {
    return {
      threshold: 90,
      state: "Legendary",
      description:
        "Perfect your campaign with comprehensive content across all dimensions",
      actionableSteps: [
        "Add advanced content like custom subclasses, magic items, or monsters",
        "Develop intricate political relationships and faction dynamics",
        "Create detailed timelines and calendars for your world",
      ],
    };
  } else {
    return {
      threshold: 100,
      state: "Perfect",
      description:
        "Your campaign is legendary! Focus on maintaining and expanding",
      actionableSteps: [
        "Plan your next session with specific scenes and encounters",
        "Continue adding new content as your campaign evolves",
        "Review and update existing elements to keep them fresh",
      ],
    };
  }
}
