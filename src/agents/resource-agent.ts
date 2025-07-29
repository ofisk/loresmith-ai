import type { D1Database } from "@cloudflare/workers-types";
import { pdfTools } from "../tools/pdf";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

interface Env {
  ADMIN_SECRET?: string;
  PDF_BUCKET: R2Bucket;
  DB: D1Database;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  CampaignManager: DurableObjectNamespace;
}

/**
 * System prompt configuration for the Resource Management Agent.
 * Defines the agent's role in managing PDF files and resources.
 */
const RESOURCE_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Resource Management AI",
  responsibilities: [
    "PDF File Management: Upload, list, and manage PDF files",
    "Resource Statistics: Provide PDF upload statistics and file information",
    "File Processing: Process uploaded PDFs for content extraction",
    "Metadata Management: Update and manage PDF metadata",
  ],
  tools: createToolMappingFromObjects(pdfTools),
  workflowGuidelines: [
    "File Listing: When users ask to see PDF files, immediately call the listPdfFiles tool",
    "File Upload: When users ask to upload PDFs, call the generatePdfUploadUrl tool",
    "Statistics: When users ask about PDF statistics, call the getPdfStats tool",
    "Processing: Guide users through the PDF upload and processing workflow",
  ],
  importantNotes: [
    "ALWAYS use tools instead of just responding with text",
    "When users ask to see PDF files, IMMEDIATELY call the listPdfFiles tool",
    "When users ask to upload PDFs, call the generatePdfUploadUrl tool",
    "When users ask about PDF statistics, call the getPdfStats tool",
    "Generate upload URL with generatePdfUploadUrl",
    "Upload the file using the provided URL",
    "Process the file with ingestPdfFile",
    "Update metadata as needed with updatePdfMetadata",
  ],
  specialization:
    "You are ONLY responsible for PDF and resource management. If users ask about campaigns, character management, or other non-resource topics, politely redirect them to the appropriate agent.",
});

/**
 * Resource Management Agent for LoreSmith AI.
 *
 * This agent specializes in PDF file and resource management, including:
 * - PDF file upload and processing
 * - File listing and organization
 * - Resource statistics and metadata management
 * - Content extraction from uploaded PDFs
 *
 * The agent provides secure upload URLs for PDF files, processes uploaded
 * content for text extraction, and manages file metadata. It focuses exclusively
 * on resource management tasks and redirects users to appropriate agents for
 * campaign, character, or other non-resource related requests.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a resource agent instance
 * const resourceAgent = new ResourceAgent(ctx, env, model);
 *
 * // Process a resource-related message
 * await resourceAgent.onChatMessage((response) => {
 *   console.log('Resource response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various resource tasks:
 * // - "Show me my PDF files"
 * // - "Upload a new PDF"
 * // - "Get PDF statistics"
 * // - "Update PDF metadata"
 * ```
 *
 * @example
 * ```typescript
 * // The agent will redirect non-resource requests:
 * // User: "Create a campaign"
 * // Agent: "I can help with PDF and resource management. For campaign creation,
 * //         please use the campaign management agent."
 * ```
 */
export class ResourceAgent extends BaseAgent {
  /**
   * Creates a new ResourceAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings (R2, D1, etc.)
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, pdfTools, RESOURCE_SYSTEM_PROMPT);
  }
}
