// AI Search utilities for structured content extraction
import { getLibraryAutoRAGService } from "./service-factory";
import { RPG_EXTRACTION_PROMPTS } from "./prompts/rpg-extraction-prompts";

// Normalize a filename to a comparable token (case-insensitive, no ext/punct)
export function normalizeNameForMatch(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .split("/")
    .pop()!
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Filename fuzzy match used for associating AI response docs to a resource
export function filenamesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Safely extract a JSON object slice from free-form model output
export function extractJsonSlice(text: string): string | null {
  let s = (text || "").trim();
  if (s.includes("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  const firstIdx = s.indexOf("{");
  const lastIdx = s.lastIndexOf("}");
  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    return s.slice(firstIdx, lastIdx + 1);
  }
  return null;
}

// Count totals and matched items (by filename) from a string JSON response
export function summarizeStructuredResponse(
  raw: string,
  targetFileName: string
) {
  try {
    const jsonSlice = extractJsonSlice(raw || "");
    const parsed = JSON.parse(jsonSlice || raw || "") as any;

    const keys = Object.keys(parsed || {}).filter(
      (k) => k !== "meta" && Array.isArray(parsed[k])
    );

    const counts: Record<string, number> = {};
    const matchedCounts: Record<string, number> = {};
    let total = 0;
    let matchedTotal = 0;

    const metaDoc = parsed?.meta?.source?.doc as string | undefined;
    const metaMatches = filenamesMatch(metaDoc, targetFileName);

    for (const k of keys) {
      const arr = (parsed[k] || []) as any[];
      const n = arr.length;
      counts[k] = n;
      total += n;
      const matched = metaMatches
        ? n
        : arr.filter((it) => filenamesMatch(it?.source?.doc, targetFileName))
            .length;
      matchedCounts[k] = matched;
      matchedTotal += matched;
    }

    return {
      ok: true,
      total,
      counts,
      keys,
      matchedCounts,
      matchedTotal,
    } as const;
  } catch {
    return {
      ok: false,
      total: 0,
      counts: {},
      keys: [] as string[],
      matchedCounts: {},
      matchedTotal: 0,
    } as const;
  }
}

// Filter parsed structured content to items that plausibly belong to the resource
export function filterParsedContentToResource(
  parsedContent: Record<string, any>,
  resourceFileName: string
) {
  const preCounts: Record<string, number> = {};
  const postCounts: Record<string, number> = {};
  const filtered: Record<string, any> = {};
  const docsSeen = new Set<string>();

  const metaDoc = (parsedContent as any)?.meta?.source?.doc as
    | string
    | undefined;
  const metaMatches = filenamesMatch(metaDoc, resourceFileName);
  if (metaDoc) docsSeen.add(metaDoc);

  for (const key of Object.keys(parsedContent)) {
    const val = (parsedContent as any)[key];
    if (key === "meta" || !Array.isArray(val)) {
      filtered[key] = val;
      continue;
    }
    preCounts[key] = val.length;

    // If meta matches the file, retain all items for this content type
    // Otherwise, retain items that individually match the resource's filename
    const arr = metaMatches
      ? val
      : (val as any[]).filter((it) => {
          const d = (it as any)?.source?.doc as string | undefined;
          if (typeof d === "string") docsSeen.add(d);
          return filenamesMatch(d, resourceFileName);
        });

    postCounts[key] = arr.length;
    filtered[key] = arr;
  }

  return {
    filtered,
    preCounts,
    postCounts,
    docsSeen,
    metaDoc,
    metaMatches,
  } as const;
}

// Execute AI search with retry logic and structured response parsing
export async function executeAISearchWithRetry(
  env: any,
  username: string,
  _campaignId: string,
  resourceFileName: string,
  maxRetries: number = 1,
  onChunkComplete?: (chunkResult: any, chunkNumber: number) => Promise<void>,
  debugUnfiltered: boolean = false
) {
  const libraryAutoRAG = getLibraryAutoRAGService(env, username);

  // Use the directory path (without filename) for the filter
  // The enforced filter will ensure tenant isolation (library/username/)
  let fullPathForFilter = resourceFileName;

  // Ensure the path matches the enforced path format (no leading slash)
  if (fullPathForFilter.startsWith("/library/")) {
    fullPathForFilter = fullPathForFilter.substring(1); // Remove leading slash
  } else if (!fullPathForFilter.startsWith("library/")) {
    fullPathForFilter = "library/" + fullPathForFilter;
  }

  // Extract the directory path (remove the filename from the end)
  // e.g., "library/user/file.pdf/file.pdf" -> "library/user/file.pdf/"
  const lastSlashIndex = fullPathForFilter.lastIndexOf("/");
  if (lastSlashIndex > 0) {
    fullPathForFilter = fullPathForFilter.substring(0, lastSlashIndex + 1);
  }

  //TODO: remove the redundant search once file upload and autorag indexing are more reliable
  // First, try a simple search to see if the file is indexed at all
  console.log(`[AI Search] Testing basic search for file: ${resourceFileName}`);

  // Add a delay to allow AutoRAG to make content searchable
  console.log(
    `[AI Search] Waiting for AutoRAG content to become searchable...`
  );
  await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay

  const structuredExtractionPrompt =
    RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(resourceFileName);

  console.log(
    `[AI Search] Extracting structured content from ${resourceFileName}`
  );
  console.log(
    `[AI Search] Prompt preview: ${structuredExtractionPrompt.substring(0, 200)}...`
  );

  // For large files, we'll use a chunked approach to avoid timeouts
  // Process in multiple smaller batches and combine results
  return await executeChunkedAISearch(
    libraryAutoRAG,
    structuredExtractionPrompt,
    resourceFileName,
    fullPathForFilter,
    maxRetries,
    onChunkComplete,
    debugUnfiltered
  );
}

// Execute AI search in chunks to handle large files with many expected shards
async function executeChunkedAISearch(
  libraryAutoRAG: any,
  structuredExtractionPrompt: string,
  resourceFileName: string,
  fullPathForFilter: string,
  maxRetries: number,
  onChunkComplete?: (chunkResult: any, chunkNumber: number) => Promise<void>,
  debugUnfiltered: boolean = false
) {
  const CHUNK_SIZE = 5; // Process 5 results at a time (more efficient without diversity ranking)
  const MAX_CHUNKS = 2; // Maximum 2 chunks (10 total results)
  const CHUNK_DELAY = 5000; // 5 second delay between chunks

  let allResults: any[] = [];
  let hasMoreResults = true;
  let chunkNumber = 0;

  console.log(
    `[AI Search] Starting chunked processing for large file: ${resourceFileName}`
  );
  console.log(
    `[AI Search] Chunk size: ${CHUNK_SIZE}, Max chunks: ${MAX_CHUNKS}`
  );

  while (hasMoreResults && chunkNumber < MAX_CHUNKS) {
    chunkNumber++;
    console.log(`[AI Search] Processing chunk ${chunkNumber}/${MAX_CHUNKS}`);

    try {
      const chunkResult = await executeSingleChunk(
        libraryAutoRAG,
        structuredExtractionPrompt,
        resourceFileName,
        fullPathForFilter,
        CHUNK_SIZE,
        maxRetries,
        chunkNumber, // Pass chunk number for offset calculation
        debugUnfiltered
      );

      // Extract data from the AutoRAG response structure
      const chunkData = chunkResult?.result?.data || chunkResult?.data || [];

      if (chunkData.length > 0) {
        allResults.push(...chunkData);
        console.log(
          `[AI Search] Chunk ${chunkNumber} found ${chunkData.length} results`
        );

        // Call the streaming callback if provided
        if (onChunkComplete) {
          try {
            await onChunkComplete(chunkResult, chunkNumber);
            console.log(
              `[AI Search] Chunk ${chunkNumber} streaming callback completed`
            );
          } catch (callbackError) {
            console.error(
              `[AI Search] Chunk ${chunkNumber} streaming callback failed:`,
              callbackError
            );
            // Don't stop processing if callback fails
          }
        }

        // Check if we should continue
        if (chunkData.length < CHUNK_SIZE) {
          console.log(
            `[AI Search] Chunk ${chunkNumber} returned ${chunkData.length} results (less than ${CHUNK_SIZE}), assuming no more content`
          );
          hasMoreResults = false;
        } else {
          // Wait before processing next chunk to avoid overwhelming AutoRAG
          console.log(
            `[AI Search] Waiting ${CHUNK_DELAY}ms before next chunk...`
          );
          await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
        }
      } else {
        console.log(
          `[AI Search] Chunk ${chunkNumber} returned no results, stopping chunked processing`
        );
        hasMoreResults = false;
      }
    } catch (error) {
      console.error(`[AI Search] Chunk ${chunkNumber} failed:`, error);
      // Continue with next chunk even if one fails
      if (chunkNumber < MAX_CHUNKS) {
        console.log(`[AI Search] Continuing with next chunk despite error`);
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
      } else {
        throw error; // Only throw if this was the last chunk
      }
    }
  }

  console.log(
    `[AI Search] Chunked processing complete. Total results: ${allResults.length}`
  );

  // If no results were found, try a single ultra-minimal request
  if (allResults.length === 0) {
    console.log(
      `[AI Search] No results from chunked processing, trying single ultra-minimal request...`
    );

    try {
      const fallbackResult = await executeSingleChunk(
        libraryAutoRAG,
        structuredExtractionPrompt,
        resourceFileName,
        fullPathForFilter,
        1, // Ultra-minimal: just 1 result
        0, // No retries for fallback
        0, // Chunk 0 for fallback
        debugUnfiltered
      );

      // Extract data from the AutoRAG response structure
      const fallbackData =
        fallbackResult?.result?.data || fallbackResult?.data || [];

      if (fallbackData.length > 0) {
        allResults.push(...fallbackData);
        console.log(
          `[AI Search] Fallback request found ${fallbackData.length} results`
        );

        // Call streaming callback for fallback results
        if (onChunkComplete) {
          try {
            await onChunkComplete(fallbackResult, 0);
            console.log(`[AI Search] Fallback streaming callback completed`);
          } catch (callbackError) {
            console.error(
              `[AI Search] Fallback streaming callback failed:`,
              callbackError
            );
          }
        }
      }
    } catch (fallbackError) {
      console.error(`[AI Search] Fallback request also failed:`, fallbackError);
    }
  }

  // Return a combined result structure
  return {
    response: `Processed ${allResults.length} results across ${chunkNumber} chunks`,
    data: allResults,
    has_more: hasMoreResults && chunkNumber >= MAX_CHUNKS,
    next_page: null,
    object: "vector_store.search_results.page",
  };
}

// Execute a single chunk of AI search
async function executeSingleChunk(
  libraryAutoRAG: any,
  structuredExtractionPrompt: string,
  resourceFileName: string,
  fullPathForFilter: string,
  chunkSize: number,
  maxRetries: number,
  chunkNumber: number = 1,
  debugUnfiltered: boolean = false
) {
  async function runAISearchOnce(attemptNumber: number = 0) {
    console.log(
      `[AI Search] Calling AutoRAG AI Search with prompt length: ${structuredExtractionPrompt.length}`
    );

    // Use chunk size for this specific chunk, with timeout reduction on retries
    const maxResults =
      attemptNumber > 0 ? Math.max(2, chunkSize - attemptNumber) : chunkSize;
    console.log(
      `[AI Search] Using max_results: ${maxResults} (attempt ${attemptNumber + 1}, chunk size: ${chunkSize})`
    );

    // DEBUG: Log the filter being applied
    if (debugUnfiltered) {
      console.log(`[AI Search] DEBUG: UNFILTERED search - NO filters applied`);
    } else {
      console.log(
        `[AI Search] DEBUG: FILTERED search - Applying filter: folder = "${fullPathForFilter}"`
      );
    }

    // For chunked processing, use the same ranking strategy as single requests
    // Diversity ranking was causing issues by filtering out relevant results
    const rankingOptions = {}; // Use default relevance ranking for all chunks

    console.log(
      `[AI Search] Chunk ${chunkNumber} using ranking options:`,
      rankingOptions
    );

    // Build search options
    const searchOptions: any = {
      max_results: maxResults, // Use chunk size
      rewrite_query: false,
      ranking_options: rankingOptions, // Different ranking for different chunks
    };

    // Only apply filters if not in debug unfiltered mode
    if (!debugUnfiltered) {
      searchOptions.filters = {
        type: "eq",
        key: "folder",
        value: fullPathForFilter,
      };
    }

    console.log(
      `[AI Search] DEBUG: Full search options:`,
      JSON.stringify(searchOptions, null, 2)
    );

    const res = await libraryAutoRAG.aiSearch(
      structuredExtractionPrompt,
      searchOptions
    );

    console.log(
      `[AI Search] Raw response from AutoRAG:`,
      JSON.stringify(res, null, 2)
    );

    return res;
  }

  // Retry logic for this chunk
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runAISearchOnce(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        // Check if it's a timeout error and use different strategies
        const isTimeoutError =
          (error as any)?.message?.includes("Operation timed out") ||
          (error as any)?.message?.includes("7019");
        const isCapacityError =
          (error as any)?.message?.includes("Capacity temporarily exceeded") ||
          (error as any)?.message?.includes("3040");

        let delay: number;
        if (isTimeoutError) {
          // For timeouts, use longer delays and reduce max_results on retry
          delay = 2 ** attempt * 3000; // 3s, 6s, 12s for timeout errors
          console.warn(
            `[AI Search] Timeout detected on attempt ${attempt + 1}, will reduce max_results on retry`
          );
        } else if (isCapacityError) {
          delay = 2 ** attempt * 10000; // 10s, 20s, 40s for capacity errors (very conservative)
          console.warn(
            `[AI Search] Capacity error detected on attempt ${attempt + 1}, using longer delays`
          );
        } else {
          delay = 500; // Default short delay
        }

        console.warn(
          `[AI Search] Chunk attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
          error
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// Extract and parse AI response into structured content
export function parseAIResponse(aiResponse: string) {
  const cleanResponse = aiResponse.trim();
  const jsonSlice = extractJsonSlice(cleanResponse);
  const parsedContent = JSON.parse(jsonSlice || cleanResponse);

  console.log(`[AI Search] Parsed response structure:`, {
    keys: Object.keys(parsedContent),
    hasMeta: !!parsedContent.meta,
    contentTypes: Object.keys(parsedContent).filter(
      (key) => key !== "meta" && Array.isArray(parsedContent[key])
    ),
  });

  return parsedContent;
}
