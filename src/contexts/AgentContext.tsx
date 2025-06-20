import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";

interface AgentContextType {
  agent: any;
  messages: any[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent, options?: any) => void;
  addToolResult: (params: { toolCallId: string; result: any }) => void;
  clearHistory: () => void;
  isLoading: boolean;
  stop: () => void;
  // Method to invoke tools programmatically
  invokeTool: (toolName: string, args: any) => Promise<any>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

interface AgentProviderProps {
  children: ReactNode;
  sessionId: string;
}

export const AgentProvider: React.FC<AgentProviderProps> = ({ children, sessionId }) => {
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
  } = useAgentChat({
    agent,
    maxSteps: 5,
  });

  // Method to invoke tools programmatically
  const invokeTool = async (toolName: string, args: any): Promise<any> => {
    // For now, we'll use a simple approach: add a message that triggers the tool
    // and then wait for the response. This is a simplified version.
    
    // Create a unique message ID for this tool invocation
    const messageId = `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Add a message that will trigger the tool
    const toolMessage = {
      id: messageId,
      role: "user" as const,
      content: `Execute tool: ${toolName}`,
      createdAt: new Date(),
    };

    // We need to integrate this with the agent system properly
    // For now, return a promise that will be resolved when the tool completes
    return new Promise((resolve, reject) => {
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
    invokeTool,
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
};

export const useAgentContext = (): AgentContextType => {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgentContext must be used within an AgentProvider");
  }
  return context;
}; 