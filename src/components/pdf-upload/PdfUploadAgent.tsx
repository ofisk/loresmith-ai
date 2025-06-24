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
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

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
      setShowAuthInput(true);
    } catch (error) {
      console.error("Error starting authentication:", error);
      setAuthError("Failed to start authentication");
    }
  };

  const handleSubmitAuth = async () => {
    if (!adminKey.trim()) {
      setAuthError("Please enter your admin key");
      return;
    }

    try {
      setAuthenticating(true);
      setAuthError(null);
      
      // Direct authentication call to avoid exposing key in chat
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          providedKey: adminKey
        })
      });

      const result = await response.json() as { success: boolean; authenticated: boolean; error?: string };
      
      if (result.success && result.authenticated) {
        // Authentication successful - update state
        setIsAuthenticated(true);
        setAuthError(null);
        
        // Send a generic success message to the agent (without the key)
        await append({
          role: "user",
          content: "I have successfully authenticated for PDF upload functionality.",
        });
      } else {
        // Authentication failed
        setIsAuthenticated(false);
        setAuthError(result.error || "Authentication failed. Please check your admin key.");
      }
      
      // Clear the input and hide it after submission
      setAdminKey("");
      setShowAuthInput(false);
    } catch (error) {
      console.error("Error submitting authentication:", error);
      setAuthError("Failed to submit authentication. Please try again.");
      setIsAuthenticated(false);
    } finally {
      setAuthenticating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            {showAuthInput 
              ? "Please enter your admin key to enable PDF upload functionality."
              : "Please provide your admin key to enable PDF upload functionality. Click the button below to start the authentication process."
            }
          </p>
        </div>
        {authError && (
          <div className="text-ob-destructive text-sm">
            {authError}
          </div>
        )}
        
        {showAuthInput ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-ob-base-300 text-sm font-medium">
                Admin Key
              </label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && adminKey.trim() && !authenticating) {
                    handleSubmitAuth();
                  } else if (e.key === "Escape") {
                    setShowAuthInput(false);
                    setAdminKey("");
                    setAuthError(null);
                  }
                }}
                placeholder="Enter your admin key..."
                className="w-full px-3 py-2 border border-ob-border rounded-md bg-ob-base-100 text-ob-base-300 placeholder-ob-base-200 focus:outline-none focus:ring-2 focus:ring-ob-primary focus:border-transparent"
                disabled={authenticating}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitAuth}
                variant="primary"
                size="base"
                loading={authenticating}
                disabled={!adminKey.trim() || authenticating}
              >
                {authenticating ? "Authenticating..." : "Authenticate"}
              </Button>
              <Button
                onClick={() => {
                  setShowAuthInput(false);
                  setAdminKey("");
                  setAuthError(null);
                }}
                variant="secondary"
                size="base"
                disabled={authenticating}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleAuthenticate}
            variant="primary"
            size="base"
          >
            Start Authentication
          </Button>
        )}
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