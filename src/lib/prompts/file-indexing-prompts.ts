/**
 * Prompts for checking file indexing status and generating metadata
 */

/**
 * Prompt to check if a file has been indexed
 * @param filename - The name of the file to check
 * @returns Formatted prompt string
 */
export function getFileExistencePrompt(filename: string): string {
  return `Do you have information from a file named "${filename}"? Answer 'yes' or 'no'.`;
}

/**
 * Prompt for generating semantic metadata from document content
 * @param fileName - The name of the file
 * @param fileKey - The file key/identifier
 * @param username - The username of the file owner
 * @param hasContent - Whether file content is available
 * @param chunkPreview - Preview of the current chunk content (optional)
 * @param totalChunks - Total number of chunks (optional)
 * @param currentChunkIndex - Current chunk index (0-based, optional)
 * @returns Formatted prompt string
 */
export function getSemanticMetadataPrompt(
  fileName: string,
  fileKey: string,
  username: string,
  hasContent: boolean,
  chunkPreview?: string,
  totalChunks?: number,
  currentChunkIndex?: number
): string {
  const contentPreview =
    hasContent && chunkPreview
      ? `Document content preview:\n${chunkPreview}\n\n`
      : "";

  const isMultiChunk =
    hasContent && totalChunks !== undefined && totalChunks > 1;
  const chunkNote =
    isMultiChunk && currentChunkIndex !== undefined
      ? `Note: This is chunk ${currentChunkIndex + 1} of ${totalChunks}.\n`
      : "";

  return `Analyze this document and generate meaningful metadata.

Document filename: ${fileName}
File key: ${fileKey}
Username: ${username}

${contentPreview}${chunkNote}
Based on ${hasContent ? "the document content" : "the filename"}, generate:
1. A clean, user-friendly display name (e.g., "Player's Handbook" instead of "players_handbook_v3.2_final.pdf")
2. A short description (1-2 sentences) of what this document contains
3. Relevant tags that describe topics, themes, or content type

Please provide the response in this exact JSON format:
{
  "displayName": "User-friendly display name",
  "description": "Short description of the document",
  "tags": ["tag1", "tag2", "tag3"]
}
`;
}
