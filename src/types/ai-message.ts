import type { Explainability } from "./explainability";

export interface Message {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<{
    type: string;
    text?: string;
    toolInvocation?: {
      state: string;
      toolName: string;
      toolCallId: string;
      args?: unknown;
      result?: unknown;
    };
  }>;
  createdAt?: Date | string;
  /** May include explainability, jwt, campaignId, sessionId, etc. */
  data?: Record<string, unknown> & { explainability?: Explainability | null };
}
