// Centralized, deduped fetcher for the user's stored OpenAI key

import { API_CONFIG } from "../shared-config";

type OpenAIKeyResult = { hasKey: boolean; apiKey?: string };

let cachedResult: OpenAIKeyResult | null = null;
let inFlight: Promise<OpenAIKeyResult> | null = null;

export async function fetchOpenAIKeyOnce(
  username: string
): Promise<OpenAIKeyResult> {
  if (cachedResult) return cachedResult;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const base = API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.GET_OPENAI_KEY);
    const url = `${base}?username=${encodeURIComponent(username)}`;
    const res = await fetch(url, { method: "GET" });
    let json: any = {};
    try {
      json = await res.json();
    } catch (_) {}
    const result: OpenAIKeyResult = res.ok
      ? { hasKey: !!json.hasKey, apiKey: json.apiKey }
      : { hasKey: false };
    cachedResult = result;
    inFlight = null;
    return result;
  })();

  return inFlight;
}

export function clearOpenAIKeyCache(): void {
  cachedResult = null;
  inFlight = null;
}
