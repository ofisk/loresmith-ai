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
  maxRetries: number = 1
) {
  const libraryAutoRAG = getLibraryAutoRAGService(env, username);
  const structuredExtractionPrompt =
    RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(resourceFileName);

  console.log(
    `[AI Search] Extracting structured content from ${resourceFileName}`
  );
  console.log(
    `[AI Search] Prompt preview: ${structuredExtractionPrompt.substring(0, 200)}...`
  );

  async function runAISearchOnce() {
    console.log(
      `[AI Search] Calling AutoRAG AI Search with prompt length: ${structuredExtractionPrompt.length}`
    );
    console.log(
      `[AI Search] Applying metadata filter: filename = "${resourceFileName}"`
    );

    const res = await libraryAutoRAG.aiSearch(structuredExtractionPrompt, {
      max_results: 50,
      rewrite_query: false,
      filters: {
        type: "eq",
        key: "filename",
        value: resourceFileName,
      },
    });

    console.log(
      `[AI Search] Raw response from AutoRAG:`,
      JSON.stringify(res, null, 2)
    );

    // Extract the actual response from the nested structure
    const actualResponse = (res as any).result?.response || res.response || "";
    const preview = typeof actualResponse === "string" ? actualResponse : "";

    console.log(
      `[AI Search] Response preview (first 500 chars): ${preview.substring(0, 500)}`
    );
    console.log(
      `[AI Search] Response type: ${typeof actualResponse}, length: ${preview.length}`
    );

    const info = summarizeStructuredResponse(preview, resourceFileName);
    console.log(`[AI Search] tryCount result:`, info);

    const dataDocs = Array.isArray((res as any)?.data)
      ? Array.from(
          new Set(
            (res as any).data
              .map((d: any) => d?.filename || d?.attributes?.filename)
              .filter((x: any) => typeof x === "string")
          )
        )
      : [];

    console.log("[AI Search] Summary:", { ...info, dataDocs });

    if (info.ok && (info.matchedTotal > 0 || info.total > 0)) {
      return res;
    }

    // Return a proper response object even when no results found
    return {
      response: "",
      data: [],
      success: true,
      result: { response: "", data: [] },
    };
  }

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runAISearchOnce();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(
          `[AI Search] Attempt ${attempt + 1} failed, retrying in 500ms:`,
          error
        );
        await new Promise((r) => setTimeout(r, 500));
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
