import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../constants";

// PDF-related tool definitions

const uploadPdfFile = tool({
  description: "Upload a PDF file with optional description and tags",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the PDF file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorizing the PDF file"),
    fileContent: z.string().describe("Base64 encoded content of the PDF file"),
  }),
  execute: async ({
    fileName,
    description,
    tags,
    fileContent,
  }): Promise<ToolResult> => {
    try {
      const fileSize = Math.round((fileContent.length * 3) / 4);
      return {
        code: AUTH_CODES.SUCCESS,
        message: `PDF file "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) has been received and will be processed. The file contains ${fileContent.length} characters of base64 encoded data.`,
        data: { fileName, fileSize, description, tags, status: "processing" },
      };
    } catch (error) {
      console.error("Error uploading PDF file:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error uploading PDF file: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const listPdfFiles = tool({
  description:
    "List all PDF files that have been uploaded by the current user (JWT required)",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    console.log("[Tool] listPdfFiles received JWT:", jwt);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
      }
      console.log("[listPdfFiles] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
        {
          method: "GET",
          headers,
        }
      );
      console.log("[listPdfFiles] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to retrieve files: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as { files: unknown[] };
      if (!result.files || result.files.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "📄 No PDF files have been uploaded yet. Use the generatePdfUploadUrl tool to upload your first PDF.",
          data: { files: [] },
        };
      }
      const fileList = result.files
        .map((file: unknown) => {
          if (
            typeof file === "object" &&
            file !== null &&
            "fileName" in file &&
            "status" in file
          ) {
            // @ts-expect-error: file is unknown but we check properties
            return `- ${file.fileName} (${file.status})${file.metadata?.description ? ` - ${file.metadata.description}` : ""}`;
          }
          return "- Unknown file format";
        })
        .join("\n");
      return {
        code: AUTH_CODES.SUCCESS,
        message: `📄 Uploaded PDF files:\n${fileList}`,
        data: { files: result.files },
      };
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `❌ Error retrieving PDF files: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const getPdfStats = tool({
  description:
    "Get statistics about PDF uploads and processing for the authenticated user (JWT-based, not session-based; JWT required)",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.STATS),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to retrieve PDF stats: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        username: string;
        totalFiles: number;
        filesByStatus: Record<string, number>;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `📊 PDF Upload Statistics for user: ${result.username}\n- Total Files: ${result.totalFiles}\n- Files by Status: ${JSON.stringify(result.filesByStatus, null, 2)}`,
        data: result,
      };
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `❌ Error retrieving PDF statistics: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const generatePdfUploadUrl = tool({
  description: "Generate a presigned upload URL for a PDF file",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
    fileSize: z.number().describe("The size of the file in bytes"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileName, fileSize, jwt }): Promise<ToolResult> => {
    console.log("[Tool] generatePdfUploadUrl received JWT:", jwt);
    try {
      console.log("[generatePdfUploadUrl] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ fileName, fileSize }),
        }
      );
      console.log("[generatePdfUploadUrl] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to generate upload URL: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        uploadUrl: string;
        fileKey: string;
        username: string;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Upload URL generated successfully for "${fileName}"`,
        data: {
          uploadUrl: result.uploadUrl,
          fileKey: result.fileKey,
          username: result.username,
          fileName,
          fileSize,
        },
      };
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error generating upload URL: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const updatePdfMetadata = tool({
  description: "Update metadata for an uploaded PDF file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the PDF file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorizing the PDF file"),
    fileSize: z
      .number()
      .describe("The actual size of the uploaded file in bytes"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    fileKey,
    description,
    tags,
    fileSize,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] updatePdfMetadata received JWT:", jwt);
    try {
      console.log("[updatePdfMetadata] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPDATE_METADATA),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            fileKey,
            metadata: { description, tags, fileSize },
          }),
        }
      );
      console.log("[updatePdfMetadata] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to update metadata: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Metadata updated successfully for file "${fileKey}"`,
        data: { fileKey, description, tags, fileSize },
      };
    } catch (error) {
      console.error("Error updating metadata:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error updating metadata: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const ingestPdfFile = tool({
  description: "Trigger ingestion and processing of an uploaded PDF file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF to ingest"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileKey, jwt }): Promise<ToolResult> => {
    console.log("[Tool] ingestPdfFile received JWT:", jwt);
    try {
      console.log("[ingestPdfFile] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.INGEST),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ fileKey }),
        }
      );
      console.log("[ingestPdfFile] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to trigger ingestion: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        success: boolean;
        fileKey: string;
        status: string;
        username: string;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `PDF ingestion started successfully for "${fileKey}". Status: ${result.status}`,
        data: { fileKey, status: result.status, username: result.username },
      };
    } catch (error) {
      console.error("Error triggering ingestion:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error triggering ingestion: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

export const pdfTools = {
  uploadPdfFile,
  listPdfFiles,
  getPdfStats,
  generatePdfUploadUrl,
  updatePdfMetadata,
  ingestPdfFile,
};
