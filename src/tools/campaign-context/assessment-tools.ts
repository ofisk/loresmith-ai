import { getAssessmentService } from "../../services/service-factory";
import type { Env } from "../../middleware/auth";
import type { Campaign, CampaignResource } from "../../types/campaign";
import {
  analyzeCampaignHealth,
  type CampaignAssessment,
  extractModuleInformation,
  type ModuleAnalysis,
  type Recommendation,
} from "./assessment-core";

/**
 * Tool: Analyze campaign health and provide detailed assessment
 */
export async function assessCampaignHealthTool(
  campaignId: string,
  campaign: Campaign,
  _resources: CampaignResource[],
  env: Env
): Promise<CampaignAssessment> {
  try {
    const assessmentService = getAssessmentService(env);

    // Get real campaign data from database
    const resourcesData =
      await assessmentService.getCampaignResources(campaignId);

    // Convert database resources to CampaignResource format
    const campaignResources: CampaignResource[] = resourcesData.map(
      (resource: any) => ({
        type: "file" as const,
        id: resource.id,
        name: resource.file_name,
      })
    );

    const assessment = await analyzeCampaignHealth(
      campaignId,
      campaign,
      campaignResources
    );
    return assessment;
  } catch (error) {
    console.error("Failed to assess campaign health:", error);
    throw new Error("Failed to analyze campaign health");
  }
}

/**
 * Tool: Extract campaign information from uploaded module PDF
 */
export async function extractModuleFromPDFTool(
  campaignId: string,
  pdfContent: string,
  moduleName: string
): Promise<ModuleAnalysis> {
  try {
    const analysis = await extractModuleInformation(
      campaignId,
      pdfContent,
      moduleName
    );
    return analysis;
  } catch (error) {
    console.error("Failed to extract module information:", error);
    throw new Error("Failed to extract module information from PDF");
  }
}

/**
 * Tool: Integrate extracted module information into campaign context
 */
export async function integrateModuleIntoTool(
  campaignId: string,
  moduleAnalysis: ModuleAnalysis,
  env: Env
): Promise<{ success: boolean; message: string }> {
  try {
    const assessmentService = getAssessmentService(env);
    const success = await assessmentService.storeModuleAnalysis(
      campaignId,
      moduleAnalysis
    );

    return {
      success,
      message: success
        ? "Module information successfully integrated into campaign context"
        : "Failed to integrate module information",
    };
  } catch (error) {
    console.error("Failed to integrate module:", error);
    return {
      success: false,
      message: "Failed to integrate module information",
    };
  }
}

/**
 * Tool: Get campaign health score and quick overview
 */
export async function getCampaignHealthScoreTool(
  campaignId: string,
  campaign: Campaign,
  resources: CampaignResource[],
  env: Env
): Promise<{ overallScore: number; summary: string; priorityAreas: string[] }> {
  try {
    const assessmentService = getAssessmentService(env);
    const assessment = await assessmentService.getCampaignHealth(
      campaignId,
      campaign,
      resources
    );

    const summary = generateHealthSummary(assessment);
    const priorityAreas = assessment.priorityAreas;

    return {
      overallScore: assessment.overallScore,
      summary,
      priorityAreas,
    };
  } catch (error) {
    console.error("Failed to get campaign health score:", error);
    throw new Error("Failed to analyze campaign health");
  }
}

/**
 * Tool: Get specific recommendations for campaign improvement
 */
export async function getCampaignRecommendationsTool(
  campaignId: string,
  campaign: Campaign,
  resources: CampaignResource[],
  env: Env
): Promise<{ recommendations: Recommendation[]; focusArea: string }> {
  try {
    const assessmentService = getAssessmentService(env);
    const assessment = await assessmentService.getCampaignHealth(
      campaignId,
      campaign,
      resources
    );

    // Generate recommendations based on health score
    const recommendations: Recommendation[] = [];

    if (assessment.overallScore < 60) {
      recommendations.push({
        type: "campaign",
        priority: "high",
        title: "Improve Campaign Foundation",
        description: "Your campaign needs attention in key areas",
        actionableSteps: assessment.recommendations,
        estimatedTime: "30-45 minutes",
        impact: "high",
      });
    } else if (assessment.overallScore < 80) {
      recommendations.push({
        type: "campaign",
        priority: "medium",
        title: "Enhance Campaign Elements",
        description: "Your campaign is good but could be improved",
        actionableSteps: assessment.recommendations,
        estimatedTime: "20-30 minutes",
        impact: "medium",
      });
    } else {
      recommendations.push({
        type: "session",
        priority: "low",
        title: "Focus on Session Planning",
        description:
          "Your campaign is in great shape! Focus on session preparation",
        actionableSteps: [
          "Plan next session",
          "Review character arcs",
          "Prepare encounters",
        ],
        estimatedTime: "15-20 minutes",
        impact: "medium",
      });
    }

    // Find the focus area based on priority areas
    const focusArea =
      assessment.priorityAreas.length > 0
        ? assessment.priorityAreas[0]
        : "general";

    return {
      recommendations,
      focusArea,
    };
  } catch (error) {
    console.error("Failed to get campaign recommendations:", error);
    throw new Error("Failed to generate recommendations");
  }
}

/**
 * Tool: Analyze specific dimension of campaign health
 */
export async function analyzeCampaignDimensionTool(
  campaignId: string,
  dimension: "narrative" | "characters" | "plotHooks" | "sessionReadiness",
  campaign: Campaign,
  resources: CampaignResource[],
  env: Env
): Promise<{
  dimension: string;
  score: number;
  details: any;
  suggestions: string[];
}> {
  try {
    const assessmentService = getAssessmentService(env);
    const assessment = await assessmentService.getCampaignHealth(
      campaignId,
      campaign,
      resources
    );

    // Map the overall assessment to specific dimensions
    const dimensionScores = {
      narrative: assessment.overallScore * 0.8,
      characters: assessment.overallScore * 0.9,
      plotHooks: assessment.overallScore * 0.7,
      sessionReadiness: assessment.overallScore * 0.6,
    };

    const score = dimensionScores[dimension];
    const suggestions = generateDimensionSuggestions(dimension, {
      overallScore: score,
    });

    return {
      dimension,
      score: Math.round(score),
      details: { overallScore: score },
      suggestions,
    };
  } catch (error) {
    console.error("Failed to analyze campaign dimension:", error);
    throw new Error("Failed to analyze campaign dimension");
  }
}

// Helper functions
function generateHealthSummary(assessment: {
  overallScore: number;
  priorityAreas: string[];
}): string {
  const { overallScore } = assessment;

  if (overallScore >= 80) {
    return `Your campaign is in excellent health (${overallScore}/100)! All dimensions are well-developed.`;
  } else if (overallScore >= 60) {
    return `Your campaign is in good health (${overallScore}/100) with room for improvement in some areas.`;
  } else if (overallScore >= 40) {
    return `Your campaign needs attention (${overallScore}/100). Focus on the priority areas for improvement.`;
  } else {
    return `Your campaign needs significant work (${overallScore}/100). Consider starting fresh or major restructuring.`;
  }
}

function generateDimensionSuggestions(dimension: string, data: any): string[] {
  const suggestions: string[] = [];

  switch (dimension) {
    case "narrative":
      if (data.overallScore < 70)
        suggestions.push("Develop your world description and key locations");
      if (data.overallScore < 70)
        suggestions.push(
          "Create a clear main story arc with beginning, middle, and end"
        );
      if (data.overallScore < 70)
        suggestions.push(
          "Establish consistent themes throughout your campaign"
        );
      if (data.overallScore < 70)
        suggestions.push("Develop central conflicts that drive the story");
      break;

    case "characters":
      if (data.overallScore < 70)
        suggestions.push(
          "Develop deeper player character backstories and motivations"
        );
      if (data.overallScore < 70)
        suggestions.push(
          "Create more complex NPCs with clear goals and motivations"
        );
      if (data.overallScore < 70)
        suggestions.push("Develop relationships between characters");
      if (data.overallScore < 70)
        suggestions.push("Plan character growth and development arcs");
      break;

    case "plotHooks":
      if (data.overallScore < 70)
        suggestions.push(
          "Create more active plot hooks for players to engage with"
        );
      if (data.overallScore < 70)
        suggestions.push("Develop hooks from player character backstories");
      if (data.overallScore < 70)
        suggestions.push("Create hooks from world events and setting elements");
      if (data.overallScore < 70)
        suggestions.push("Develop escalation paths for existing hooks");
      break;

    case "sessionReadiness":
      if (data.overallScore < 70)
        suggestions.push("Prepare specific hooks for your next session");
      if (data.overallScore < 70)
        suggestions.push("Increase player investment in the story");
      if (data.overallScore < 70)
        suggestions.push("Prepare more thoroughly for upcoming sessions");
      if (data.overallScore < 70)
        suggestions.push("Make your campaign more adaptable to player choices");
      break;
  }

  return suggestions;
}
