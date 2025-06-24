import { useState, useEffect } from "react";
import { PdfUpload } from "./PdfUpload";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";
import type { Message } from "@ai-sdk/react";
import { AUTH_CODES, type ToolResult } from "@/shared";

interface PdfUploadAgentProps {
  sessionId: string;
  className?: string;
  messages: Message[];
  append: (message: { role: "user"; content: string }) => Promise<string | null | undefined>;
}

export const PdfUploadAgent = ({ sessionId, className, messages, append }: PdfUploadAgentProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check authentication status by asking the agent
  const checkAuthStatus = async () => {
    try {
      setAuthError(null);
      await append({
        role: "user",
        content: "Please check if I'm currently authenticated for PDF upload operations using the checkPdfAuthStatus tool.",
      });
    } catch (error) {
      console.error("Error checking auth status:", error);
      setAuthError("Failed to check authentication status");
    }
  };

  // Listen for tool invocations to determine authentication status
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.parts) {
      // Look for tool invocation parts
      lastMessage.parts.forEach((part) => {
        if (part.type === "tool-invocation") {
          const { toolInvocation } = part;
          
          // Check for setAdminSecret tool completion
          if (toolInvocation.toolName === "setAdminSecret" && toolInvocation.state === "result") {
            const result = toolInvocation.result as ToolResult;
            
            // Check if the result is a structured response
            if (result && typeof result === "object" && "code" in result) {
              if (result.code === AUTH_CODES.SUCCESS) {
                setIsAuthenticated(true);
                setAuthError(null);
                console.log("Authentication successful via setAdminSecret tool", result);
              } else if (result.code === AUTH_CODES.INVALID_KEY) {
                setIsAuthenticated(false);
                setAuthError(result.message || "Authentication failed. Please check your admin key.");
                console.log("Authentication failed via setAdminSecret tool", result);
              } else if (result.code === AUTH_CODES.ERROR) {
                setIsAuthenticated(false);
                setAuthError(result.message || "Authentication error occurred.");
                console.log("Authentication error via setAdminSecret tool", result);
              }
            }
          }
          
          // Check for checkPdfAuthStatus tool completion
          if (toolInvocation.toolName === "checkPdfAuthStatus" && toolInvocation.state === "result") {
            const result = toolInvocation.result as ToolResult;
            
            if (result && typeof result === "object" && "code" in result) {
              if (result.code === AUTH_CODES.SUCCESS) {
                setIsAuthenticated(true);
                setAuthError(null);
                console.log("Authentication status confirmed via checkPdfAuthStatus tool", result);
              } else if (result.code === AUTH_CODES.SESSION_NOT_AUTHENTICATED) {
                setIsAuthenticated(false);
                setAuthError(result.message || "Session not authenticated");
                console.log("Authentication status denied via checkPdfAuthStatus tool", result);
              } else if (result.code === AUTH_CODES.ERROR) {
                setIsAuthenticated(false);
                setAuthError(result.message || "Error checking authentication status");
                console.log("Authentication check error via checkPdfAuthStatus tool", result);
              }
            }
          }
        }
      });
    }
  }, [messages]);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, [sessionId]);

  // Debug log for authentication state changes
  useEffect(() => {
    console.log("Authentication state changed:", { isAuthenticated, showUpload });
  }, [isAuthenticated, showUpload]);

  const handleUpload = async (file: File, description: string, tags: string[]) => {
    setUploading(true);
    try {
      // Ask the agent to handle the PDF upload
      const uploadMessage = `Please upload this PDF file: ${file.name}${description ? `\nDescription: ${description}` : ""}${tags.length > 0 ? `\nTags: ${tags.join(", ")}` : ""}`;
      
      await append({
        role: "user",
        content: uploadMessage,
      });

      setShowUpload(false);
    } catch (error) {
      console.error("Error uploading PDF:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleAuthenticate = async () => {
    try {
      setAuthError(null);
      await append({
        role: "user",
        content: "I need to authenticate for PDF upload functionality. Please prompt me to provide my admin key so you can validate it using the setAdminSecret tool.",
      });
    } catch (error) {
      console.error("Error requesting authentication:", error);
      setAuthError("Failed to request authentication");
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            Please provide your admin key to enable PDF upload functionality. Click the button below to start the authentication process.
          </p>
        </div>
        {authError && (
          <div className="text-ob-destructive text-sm">
            {authError}
          </div>
        )}
        <Button
          onClick={handleAuthenticate}
          variant="primary"
          size="base"
        >
          Start Authentication
        </Button>
      </Card>
    );
  }

  if (!showUpload) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            ✅ You are authenticated! You can now upload PDF files for processing and analysis.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowUpload(true)}
            variant="primary"
            size="base"
          >
            Upload PDF
          </Button>
          <Button
            onClick={() => {
              append({
                role: "user",
                content: "Please list my uploaded PDF files.",
              });
            }}
            variant="secondary"
            size="base"
          >
            List Files
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-ob-base-300 font-medium">Upload PDF</h3>
            <Button
              onClick={() => setShowUpload(false)}
              variant="ghost"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
      
      <PdfUpload
        onUpload={handleUpload}
        loading={uploading}
      />
    </div>
  );
}; 