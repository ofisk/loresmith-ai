import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { Card } from "@/components/card/Card";
import type { ChatSessionSummary } from "@/hooks/useChatSessions";
import chatIcon from "@/assets/chat.png";

function formatSessionDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= 64) return normalized;
  return `${normalized.slice(0, 61)}...`;
}

interface ChatsSectionProps {
  sessions: ChatSessionSummary[];
  loading: boolean;
  error: string | null;
  currentSessionId: string | null;
  onToggle: () => void;
  isOpen: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function ChatsSection({
  sessions,
  loading,
  error,
  currentSessionId,
  onToggle,
  isOpen,
  onSelectSession,
  onNewChat,
}: ChatsSectionProps) {
  return (
    <Card className="tour-chats-section p-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-2 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <img src={chatIcon} alt="Sessions" className="w-8 h-8" />
          <span className="font-medium text-sm">Sessions</span>
        </div>
        {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <div className="p-2">
            <button
              type="button"
              onClick={onNewChat}
              className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={14} />
              New chat
            </button>
          </div>
          {loading ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-gray-500 mb-2">Loading sessions...</div>
            </div>
          ) : error ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-red-500 mb-2">Error loading sessions</div>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-gray-500 mb-2">No sessions yet</div>
              <p className="text-sm text-gray-400">
                Start a conversation to see it here
              </p>
            </div>
          ) : (
            <div className="border-t border-neutral-200 dark:border-neutral-700 max-h-48 overflow-y-auto">
              {sessions.map((session) => {
                const isCurrent = session.sessionId === currentSessionId;
                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => onSelectSession(session.sessionId)}
                    className={`w-full p-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-left ${
                      isCurrent ? "bg-neutral-100 dark:bg-neutral-800" : ""
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-sm truncate ${
                          isCurrent
                            ? "font-medium text-neutral-800 dark:text-neutral-200"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {formatDescription(
                          session.description || "New session"
                        )}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {isCurrent
                          ? `Current • ${formatSessionDate(session.lastMessageAt)}`
                          : formatSessionDate(session.lastMessageAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
