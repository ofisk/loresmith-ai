import type { Message } from "@ai-sdk/react";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import type { ChatRequestOptions } from "ai";
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
    try {
      // Create a message that will trigger the tool execution
      const toolMessage = {
        id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "user" as const,
        content: `Execute tool: ${toolName} with arguments: ${JSON.stringify(args)}`,
        createdAt: new Date(),
      };

      // Add the message to trigger tool execution
      await append(toolMessage);

      // For now, return a promise that will be resolved when the tool completes
      // In a real implementation, we would wait for the tool result from the agent
      return new Promise((resolve) => {
        console.log(`Tool invocation requested: ${toolName}`, args);

        // Simulate a successful response for now
        setTimeout(() => {
          resolve({
            success: true,
            message: `Tool ${toolName} executed successfully`,
            result: args,
          });
        }, 1000);
      });
    } catch (error) {
      console.error(`Error invoking tool ${toolName}:`, error);
      throw error;
    }
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
