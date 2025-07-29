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
 * Resource Agent implementation that handles PDF and resource-related AI interactions
 */
export class ResourceAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, pdfTools, RESOURCE_SYSTEM_PROMPT);
  }
}
