import type { Message } from "@ai-sdk/react";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { useEffect, useId, useState } from "react";
import { JWT_STORAGE_KEY } from "../constants";
import { toolsRequiringConfirmation } from "../utils/toolConfirmation";
import type { generalTools } from "../tools/general";
import type { campaignTools } from "../tools/campaign";
import type { fileTools } from "../tools/file";

/**
 * Generate a unique session ID for this browser session
 * This will be used to create a unique Durable Object ID for each session
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get or create a session ID, persisting it in localStorage
 * This ensures the same session ID is used across browser sessions
 */
function getSessionId(): string {
  const existingSessionId = localStorage.getItem("chat-session-id");
  if (existingSessionId) {
    return existingSessionId;
  }

  const newSessionId = generateSessionId();
  localStorage.setItem("chat-session-id", newSessionId);
  return newSessionId;
}

export interface ChatState {
  messages: Message[];
  input: string;
  isLoading: boolean;
  pendingToolCallConfirmation: boolean;
  textareaHeight: string;
}

export interface ChatActions {
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFormSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSuggestionSubmit: (suggestion: string) => void;
  handleClearHistory: () => void;
  stop: () => void;
  setInput: (input: string) => void;
  append: (message: Message) => void;
  addToolResult: ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: any;
  }) => void;
  clearHistory: () => void;
}

export function useChat(
  onAuthenticationRequired: () => void,
  onFileOperation: () => void
): ChatState & ChatActions {
  const chatContainerId = useId();
  const [textareaHeight, setTextareaHeight] = useState("auto");

  // Get session ID for this browser session
  const sessionId = getSessionId();

  const agent = useAgent({
    agent: "chat",
    name: sessionId, // Use the session ID to create a unique Durable Object for this session
  });

  const {
    messages: agentMessages,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    addToolResult,
    clearHistory,
    isLoading,
    stop,
    setInput,
    append,
  } = useAgentChat({
    agent,
    maxSteps: 5,
    onFinish: (result) => {
      console.log("[App] Agent finished:", result);

      // Check if the response indicates authentication is required
      if (result.content?.includes("AUTHENTICATION_REQUIRED:")) {
        console.log(
          "[App] Authentication required detected, showing auth modal"
        );
        onAuthenticationRequired();
      } else {
        console.log("[App] No authentication required in response");
      }

      // Check if the agent performed file operations that require UI refresh
      const content = result.content?.toLowerCase() || "";
      if (
        content.includes("deleted") ||
        content.includes("successfully deleted")
      ) {
        console.log("[App] File operation detected, triggering refresh event");
        onFileOperation();
      }
    },
    onError: (error) => {
      console.log("[App] Agent error:", error);
      // Check if the error is related to missing OpenAI API key
      if (
        error.message.includes("AUTHENTICATION_REQUIRED:") ||
        error.message.includes("OpenAI API key required")
      ) {
        console.log(
          "[App] Authentication required error detected, showing auth modal"
        );
        onAuthenticationRequired();
      } else {
        console.log("[App] Different error type, not showing auth modal");
      }
    },
  });

  // Scroll to bottom on mount - only if there are messages and not loading
  useEffect(() => {
    // Scroll to bottom once when the page loads with messages
    if (agentMessages.length > 0 && !isLoading) {
      const chatContainer = document.getElementById(chatContainerId);
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
  }, [agentMessages.length, isLoading, chatContainerId]);

  // Scroll to bottom when messages change or when agent is responding
  useEffect(() => {
    const chatContainer = document.getElementById(chatContainerId);
    if (chatContainer) {
      // Smooth scroll to bottom when messages change
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatContainerId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    // Only scroll if there are messages and we're not in the initial load
    if (agentMessages.length > 0 && !isLoading) {
      // Add a small delay to ensure the messages are rendered
      const timer = setTimeout(() => {
        // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // This line is removed
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [agentMessages.length, isLoading]);

  const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as
            | keyof typeof generalTools
            | keyof typeof campaignTools
            | keyof typeof fileTools
        )
    )
  );

  // Function to handle suggested prompts
  const handleSuggestionSubmit = (suggestion: string) => {
    const jwt = localStorage.getItem(JWT_STORAGE_KEY);
    console.log("[App] handleSuggestionSubmit sending JWT:", jwt);

    // Always send the message to the agent - let the agent handle auth requirements
    append({
      role: "user",
      content: suggestion,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
    // Scroll to bottom after user sends a message
    setTimeout(() => {
      const chatContainer = document.getElementById(chatContainerId);
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 100);
  };

  // Enhanced clear history function that creates a new session
  const handleClearHistory = () => {
    clearHistory();
    // Optionally create a new session ID when clearing history
    // This creates a completely fresh chat session
    const newSessionId = generateSessionId();
    localStorage.setItem("chat-session-id", newSessionId);
    // Reload the page to reinitialize with the new session ID
    window.location.reload();
  };

  // Enhanced form submission handler that includes JWT
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const jwt = localStorage.getItem(JWT_STORAGE_KEY);
    console.log("[App] handleFormSubmit sending JWT:", jwt);

    // Always send the message to the agent - let the agent handle auth requirements
    // The agent will detect missing keys and trigger the auth modal via onFinish callback
    append({
      role: "user",
      content: agentInput,
      data: jwt ? { jwt } : undefined,
    });
    setInput("");
    setTextareaHeight("auto"); // Reset height after submission
    // Scroll to bottom after user sends a message
    setTimeout(() => {
      const chatContainer = document.getElementById(chatContainerId);
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 100);
  };

  // Enhanced key down handler that includes JWT
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!agentInput.trim()) return;

      const jwt = localStorage.getItem(JWT_STORAGE_KEY);
      console.log("[App] handleKeyDown sending JWT:", jwt);

      // Always send the message to the agent - let the agent handle auth requirements
      // The agent will detect missing keys and trigger the auth modal via onFinish callback
      append({
        role: "user",
        content: agentInput,
        data: jwt ? { jwt } : undefined,
      });
      setInput("");
      setTextareaHeight("auto"); // Reset height on Enter submission
      // Scroll to bottom after user sends a message
      setTimeout(() => {
        const chatContainer = document.getElementById(chatContainerId);
        if (chatContainer) {
          chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
    }
  };

  return {
    messages: agentMessages,
    input: agentInput,
    isLoading,
    pendingToolCallConfirmation,
    textareaHeight,
    handleInputChange: handleAgentInputChange,
    handleFormSubmit,
    handleKeyDown,
    handleSuggestionSubmit,
    handleClearHistory,
    stop,
    setInput,
    append,
    addToolResult,
    clearHistory,
  };
}
