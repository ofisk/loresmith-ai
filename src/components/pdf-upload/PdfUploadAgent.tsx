import { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";
import { Input } from "@/components/input/Input";
import { Card } from "@/components/card/Card";
import { PdfUpload } from "./PdfUpload";
import { cn } from "@/lib/utils";

interface PdfUploadAgentProps {
  sessionId: string;
  className?: string;
  messages: any[];
  append: (message: any) => Promise<void>;
}

export const PdfUploadAgent = ({ sessionId, className, messages, append }: PdfUploadAgentProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check authentication status by making direct API call
  const checkAuthStatus = async () => {
    try {
      setCheckingAuth(true);
      setAuthError(null);
      
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          providedKey: "check-status-only"
        })
      });

      const result = await response.json() as { success: boolean; authenticated: boolean; error?: string };
      
      if (response.ok && result.success && result.authenticated) {
        setIsAuthenticated(true);
        setAuthError(null);
        setShowAuthInput(false);
      } else {
        setIsAuthenticated(false);
        setAuthError(null);
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      setAuthError("Failed to check authentication status");
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  // Check auth status on mount
  useEffect(() => {
    // Automatically check authentication status when component mounts
    checkAuthStatus();
  }, []);

  // Listen for agent responses to update authentication state
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      const content = lastMessage.content;
      console.log("Agent response received:", { 
        content: content.substring(0, 200) + "...", 
        isAuthenticated: isAuthenticated,
        showAuthInput: showAuthInput 
      });
      
      // Only handle agent responses for non-auth operations
      // Authentication is now handled by direct HTTP calls
    }
  }, [messages, isAuthenticated, showAuthInput]);

  const handleUpload = async (file: File, description: string, tags: string[]) => {
    setUploading(true);
    try {
      // Step 1: Ask agent to generate upload URL with session ID
      await append({
        role: "user",
        content: `Please generate an upload URL for my PDF file "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) using session ID "${sessionId}".`,
      });

      // Step 2: Wait for agent response and extract upload URL
      // We need to wait for the agent to respond with the upload URL
      // This is a simplified approach - in production you might want a more robust message listening system
      
      // For now, we'll simulate the flow by making the upload request directly
      // In a full implementation, you'd parse the agent's response to get the upload URL
      
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
      
      // Get upload URL from server (this would normally come from the agent's response)
      const uploadUrlResponse = await fetch(`${apiBaseUrl}/pdf/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileName: file.name,
          fileSize: file.size
        })
      });

      if (!uploadUrlResponse.ok) {
        throw new Error(`Failed to get upload URL: ${uploadUrlResponse.status}`);
      }

      const uploadUrlResult = await uploadUrlResponse.json() as { uploadUrl: string; fileKey: string };
      
      // Step 3: Upload file directly to R2 using the presigned URL
      const uploadResponse = await fetch(`${apiBaseUrl}${uploadUrlResult.uploadUrl}`, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": "application/pdf",
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // Step 4: Send metadata to agent after successful upload
      await append({
        role: "user",
        content: `I have successfully uploaded the PDF file "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) with file key "${uploadUrlResult.fileKey}". Please update the metadata with:
- Description: ${description || "No description provided"}
- Tags: ${tags.length > 0 ? tags.join(", ") : "No tags provided"}
- File size: ${file.size} bytes

Then please trigger ingestion for this file.`,
      });

      setShowUpload(false);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      // Send error message to agent
      await append({
        role: "user",
        content: `Failed to upload PDF file "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      });
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
      
      // Make direct authentication request to check response code
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
      
      if (response.ok && result.success && result.authenticated) {
        // Authentication successful
        setIsAuthenticated(true);
        setAuthError(null);
        setShowAuthInput(false);
        setAdminKey("");
        
        // Send success message to agent
        await append({
          role: "user",
          content: "I have successfully authenticated for PDF upload functionality.",
        });
      } else {
        // Authentication failed
        setIsAuthenticated(false);
        setAuthError(result.error || "Authentication failed. Please check your admin key.");
        setShowAuthInput(true);
      }
      
    } catch (error) {
      console.error("Error submitting authentication:", error);
      setAuthError("Failed to submit authentication. Please try again.");
      setIsAuthenticated(false);
      setShowAuthInput(true);
    } finally {
      setAuthenticating(false);
    }
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            Checking authentication status...
          </p>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload Authentication</h3>
          <p className="text-ob-base-200 text-sm">
            You need to authenticate to upload and process PDF files.
          </p>
          {authError && (
            <div className="text-ob-destructive text-sm">
              {authError}
            </div>
          )}
        </div>
        
        {showAuthInput ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-ob-base-300 text-sm font-medium">
                Admin Key
              </label>
              <Input
                type="password"
                placeholder="Enter your admin key..."
                value={adminKey}
                onValueChange={(value) => setAdminKey(value)}
                size="base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && adminKey.trim()) {
                    handleSubmitAuth();
                  }
                }}
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
    <PdfUpload
      onUpload={handleUpload}
      loading={uploading}
      className={className}
    />
  );
}; 