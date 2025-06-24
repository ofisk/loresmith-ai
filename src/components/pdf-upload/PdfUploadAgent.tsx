import { useState, useEffect } from "react";
import { PdfUpload } from "./PdfUpload";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";
import type { Message } from "@ai-sdk/react";

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

  // Listen for agent responses to determine authentication status
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      const content = lastMessage.content;
      if (typeof content === "string") {
        // Check for successful authentication messages
        if (content.includes("✅ Admin key validated successfully") || 
            content.includes("✅ Session is authenticated") ||
            content.includes("successfully validated") ||
            content.includes("access to PDF upload")) {
          setIsAuthenticated(true);
          setAuthError(null);
          console.log("Authentication detected as successful");
        } 
        // Check for failed authentication messages
        else if (content.includes("❌ Invalid admin key") ||
                 content.includes("❌ Session is not authenticated") ||
                 content.includes("Invalid admin key")) {
          setIsAuthenticated(false);
          setAuthError("Authentication failed. Please check your admin key.");
          console.log("Authentication detected as failed");
        }
        // Check for general authentication status responses
        else if (content.includes("Session is authenticated for PDF operations")) {
          setIsAuthenticated(true);
          setAuthError(null);
          console.log("Authentication status confirmed");
        }
      }
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