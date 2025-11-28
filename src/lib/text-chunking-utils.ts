/**
 * Text chunking utilities for processing large text content
 * Used for chunking text before sending to LLMs to respect token limits
 */

/**
 * Chunk text by pages (for PDFs) or by character count to stay under token limits
 * Pages are identified by [Page N] markers added during PDF extraction
 *
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum size of each chunk in characters
 * @returns Array of text chunks
 */
export function chunkTextByPages(text: string, maxChunkSize: number): string[] {
  const pagePattern = /\[Page \d+\]/g;
  const pages = text.split(pagePattern);
  const pageMarkers = text.match(pagePattern) || [];

  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < pages.length; i++) {
    const pageMarker = i > 0 ? pageMarkers[i - 1] : "";
    const pageContent = pages[i];

    if (
      currentChunk.length > 0 &&
      currentChunk.length + pageMarker.length + pageContent.length >
        maxChunkSize
    ) {
      chunks.push(currentChunk);
      currentChunk = pageMarker + pageContent;
    } else {
      currentChunk += pageMarker + pageContent;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Chunk text by character count, trying to break at word boundaries
 *
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum size of each chunk in characters
 * @returns Array of text chunks
 */
export function chunkTextByCharacterCount(
  text: string,
  maxChunkSize: number
): string[] {
  const chunks: string[] = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    const remainingText = text.slice(currentPos);
    let chunkSize = Math.min(maxChunkSize, remainingText.length);

    if (chunkSize < remainingText.length) {
      const lastSpace = remainingText.lastIndexOf(" ", chunkSize);
      const lastNewline = remainingText.lastIndexOf("\n", chunkSize);
      const breakPoint = Math.max(lastSpace, lastNewline);

      if (breakPoint > chunkSize * 0.8) {
        chunkSize = breakPoint;
      }
    }

    const chunk = remainingText.slice(0, chunkSize);
    chunks.push(chunk);
    currentPos += chunkSize;
  }

  return chunks.length > 0 ? chunks : [text];
}
