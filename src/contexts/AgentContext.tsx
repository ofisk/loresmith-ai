import type React from "react";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { Message } from "@ai-sdk/react";
import type { ChatRequestOptions } from "ai";

interface AgentContextType {
  agent: unknown;
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (
    event?: { preventDefault?: (() => void) | undefined } | undefined,
    chatRequestOptions?: ChatRequestOptions | undefined
  ) => void;
  addToolResult: (params: { toolCallId: string; result: unknown }) => void;
  clearHistory: () => void;
  isLoading: boolean;
  stop: () => void;
  // Additional functions from useAgentChat
  setInput: (input: string) => void;
  append: (message: Message) => void;
  // Method to invoke tools programmatically
  invokeTool: (toolName: string, args: unknown) => Promise<unknown>;
}

export const AgentContext = createContext<AgentContextType | undefined>(
  undefined
);

// Hook to consume the agent context
export const useAgentContext = () => {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgentContext must be used within an AgentProvider");
  }
  return context;
};

interface AgentProviderProps {
  children: ReactNode;
  sessionId: string;
}

export const AgentProvider: React.FC<AgentProviderProps> = ({
  children,
  sessionId,
}) => {
  const agent = useAgent({
    agent: "Chat",
    name: sessionId,
  });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    addToolResult,
    clearHistory,
    isLoading,
    stop,
    setInput,
    append,
  } = useAgentChat({
    agent,
    maxSteps: 5,
  });

  // Method to invoke tools programmatically
  const invokeTool = async (
    toolName: string,
    args: unknown
  ): Promise<unknown> => {
    // For now, we'll use a simple approach: add a message that triggers the tool
    // and then wait for the response. This is a simplified version.

    // We need to integrate this with the agent system properly
    // For now, return a promise that will be resolved when the tool completes
    return new Promise((resolve) => {
      // This is a placeholder implementation
      // In a real implementation, we would:
      // 1. Add the message to the conversation
      // 2. Trigger the agent to process the message
      // 3. Wait for the tool result
      // 4. Resolve with the result

      console.log(`Tool invocation requested: ${toolName}`, args);

      // For now, simulate a successful response
      setTimeout(() => {
        resolve({
          success: true,
          message: `Tool ${toolName} executed successfully`,
          result: args,
        });
      }, 1000);
    });
  };

  const value: AgentContextType = {
    agent,
    messages,
    input,
    handleInputChange,
    handleSubmit,
    addToolResult,
    clearHistory,
    isLoading,
    stop,
    setInput,
    append,
    invokeTool,
  };

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
};
