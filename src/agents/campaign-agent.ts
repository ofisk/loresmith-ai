import { campaignTools } from "../tools/campaign";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

const CAMPAIGN_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Agent",
  responsibilities: [
    "Campaign Management: Create, update, and manage campaigns",
    "Resource Management: Add, organize, and manage campaign resources (PDFs, documents, etc.)",
    "Campaign Planning: Provide intelligent suggestions and assess campaign readiness",
    "Resource Organization: Help users organize their campaign materials effectively",
  ],
  tools: createToolMappingFromObjects(campaignTools),
  workflowGuidelines: [
    "Campaign Setup: Help users create and configure new campaigns",
    "Resource Organization: Assist with adding and organizing campaign resources",
    "Campaign Planning: Provide intelligent suggestions and readiness assessments",
    "Campaign Management: Help users manage their existing campaigns",
  ],
  importantNotes: [
    "Guide users through campaign creation with appropriate settings",
    "Help organize initial campaign resources",
    "Set up campaign structure for optimal organization",
    "Help users add various resource types (PDFs, documents, images)",
    "Organize resources with appropriate metadata and tags",
    "Provide suggestions for resource organization",
    "Analyze campaign resources to provide intelligent suggestions",
    "Assess campaign readiness based on available materials",
    "Offer recommendations for campaign improvement",
  ],
});

export class CampaignAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignTools, CAMPAIGN_SYSTEM_PROMPT);
  }
}
