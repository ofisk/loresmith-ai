/**
 * Prompts for checking file indexing status with AutoRAG
 */

/**
 * Prompt to check if AutoRAG has information from a specific file
 * @param filename - The name of the file to check
 * @returns Formatted prompt string
 */
export function getFileExistencePrompt(filename: string): string {
  return `Do you have information from a file named "${filename}"? Answer 'yes' or 'no'.`;
}
