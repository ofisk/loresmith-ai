/**
 * Admin Secret Context
 * 
 * Manages admin secret state, verification, storage, and prompt handling.
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { Message } from "@ai-sdk/react";

interface AdminContextType {
  adminSecret: string;
  setAdminSecret: (secret: string) => void;
  isVerified: boolean;
  verifyFromToolResult: (messages: Message[]) => void;
  handleUploadError: (error: string) => void;
  clearAdminSecret: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [adminSecret, setAdminSecretState] = useState<string>(() => {
    // Get admin secret from sessionStorage on initialization
    return sessionStorage.getItem("admin-secret") || "";
  });

  const [isVerified, setIsVerified] = useState<boolean>(false);

  // Update sessionStorage when admin secret changes
  useEffect(() => {
    if (adminSecret) {
      sessionStorage.setItem("admin-secret", adminSecret);
      setIsVerified(true);
    } else {
      sessionStorage.removeItem("admin-secret");
      setIsVerified(false);
    }
  }, [adminSecret]);

  const setAdminSecret = (secret: string) => {
    setAdminSecretState(secret);
  };

  const clearAdminSecret = () => {
    setAdminSecretState("");
    sessionStorage.removeItem("admin-secret");
    setIsVerified(false);
  };

  // Verify admin secret from tool results in messages
  const verifyFromToolResult = (messages: Message[]) => {
    if (!adminSecret && messages.length > 0) {
      // Look for successful setAdminSecret tool invocation
      for (const message of messages) {
        if (message.parts) {
          for (const part of message.parts) {
            if (
              part.type === "tool-invocation" &&
              part.toolInvocation?.toolName === "setAdminSecret" &&
              part.toolInvocation?.state === "result"
            ) {
              const result = part.toolInvocation?.result;
              try {
                // Parse JSON response
                const parsedResult = JSON.parse(result);
                if (
                  parsedResult?.status === "SUCCESS" &&
                  parsedResult?.secret
                ) {
                  setAdminSecret(parsedResult.secret);
                  return;
                }
              } catch (error) {
                console.warn(
                  "Failed to parse setAdminSecret result as JSON:",
                  error
                );
              }
            }
          }
        }
      }
    }
  };

  // Handle PDF upload errors and prompt for admin secret if needed
  const handleUploadError = (error: string) => {
    if (
      error.includes("Unauthorized") ||
      error.includes("Admin secret")
    ) {
      const newSecret = prompt(
        "🧙‍♂️ Speak the Sacred Incantation (admin secret) to access the mystical archive:"
      );
      if (newSecret) {
        setAdminSecret(newSecret);
      }
    }
  };

  const value: AdminContextType = {
    adminSecret,
    setAdminSecret,
    isVerified,
    verifyFromToolResult,
    handleUploadError,
    clearAdminSecret,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}; 