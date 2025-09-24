import type { D1Database } from "@cloudflare/workers-types";
import { fileTools } from "../tools/file";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

interface Env {
  ADMIN_SECRET?: string;
  DB: D1Database;
  Chat: DurableObjectNamespace;
}

/**
 * System prompt configuration for the Resource Management Agent.
 * Defines the agent's role in managing files and resources.
 */
const RESOURCE_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Resource Management AI",
  responsibilities: [
    "File Management: Upload, list, and manage files",
    "Resource Statistics: Provide file upload statistics and file information",
    "File Processing: Process uploaded files for content extraction",
    "Metadata Management: Update and auto-generate file metadata",
    "File Deletion: Delete individual or all files",
  ],
  tools: createToolMappingFromObjects(fileTools),
  workflowGuidelines: [
    "File Listing: When users ask to see their files, call the listFiles tool",
    "Processing: The new upload system automatically processes files during upload",
    "Async Processing: After successful upload, files are processed asynchronously by AutoRAG for indexing and searchability",
    "Uploaded Files: When users mention they have uploaded a file, use updateFileMetadata if they want to modify metadata",
    "Auto-Generation: When users ask to auto-generate metadata for existing files, use autoGenerateFileMetadata tool",
    "File Deletion: When users ask to delete files, call the deleteFile tool",
    "Bulk Deletion: When users ask to delete 'all' or 'all resources', ALWAYS call listFiles first to get the current list of files, then call deleteFile for each file individually. NEVER use cached file information.",
    "Statistics: When users ask about file statistics, call the getFileStats tool",
  ],
  importantNotes: [
    "ALWAYS use tools instead of just responding with text",
    "When users ask to see files, IMMEDIATELY call the listFiles tool",
    "When users ask about file statistics, call the getFileStats tool",
    "When users mention they have uploaded a file, use updateFileMetadata to update metadata if needed",
    "When users ask to auto-generate metadata for existing files, use autoGenerateFileMetadata tool",
    "When users ask to delete files, call the deleteFile tool",
    "When users ask to delete 'all' or 'all resources', ALWAYS call listFiles first to get the current list of files, then call deleteFile for each file individually. NEVER use cached file information.",
    "Update metadata as needed with updateFileMetadata",
    "Auto-generate metadata for existing files with autoGenerateFileMetadata",
    "NEVER try to add files to campaigns - that's handled by the campaign agent",
    "Inform users that files are processed asynchronously after upload - they will be searchable once AutoRAG indexing is complete",
  ],
  specialization:
    "You are ONLY responsible for file and resource management. If users ask about campaigns, character management, or other non-resource topics, politely redirect them to the appropriate agent.",
});

/**
 * Resource Management Agent for LoreSmith AI.
 *
 * This agent specializes in file and resource management, including:
 * - File upload and processing
 * - File listing and organization
 * - Resource statistics and metadata management
 * - Content extraction from uploaded files
 *
 * The agent provides secure upload URLs for files, processes uploaded
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
 * // - "Show me my files"
 * // - "Upload a new file"
 * // - "Get file statistics"
 * // - "Update file metadata"
 * ```
 *
 * @example
 * ```typescript
 * // The agent will redirect non-resource requests:
 * // User: "Create a campaign"
 * // Agent: "I can help with file and resource management. For campaign creation,
 * //         please use the campaign management agent."
 * ```
 */
export class ResourceAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "resources",
    description:
      "Manages file uploads, file processing, metadata updates, and file ingestion. Handles file upload completion, metadata management, and file processing operations. Specifically handles messages about uploaded files, file keys, metadata updates, and file ingestion. Informs users about asynchronous AutoRAG processing after uploads.",
    systemPrompt: RESOURCE_SYSTEM_PROMPT,
    tools: fileTools,
  };

  /**
   * Creates a new ResourceAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings (R2, D1, etc.)
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: Env, model: any) {
    super(ctx, env, model, fileTools);
  }
}
