import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "@/shared-config";

export interface ChatSessionSummary {
  sessionId: string;
  lastMessageAt: string;
  description: string;
}

interface UseChatSessionsOptions {
  isAuthenticated: boolean;
  getJwt: () => string | null;
}

export function useChatSessions({
  isAuthenticated,
  getJwt,
}: UseChatSessionsOptions) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([]);
      return;
    }
    const jwt = getJwt();
    if (!jwt) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHAT.SESSIONS);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          setSessions([]);
          return;
        }
        throw new Error("Failed to load chat sessions");
      }
      const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, getJwt]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { sessions, loading, error, refetch };
}
