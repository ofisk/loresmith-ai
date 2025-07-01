import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { UploadDialog } from "./UploadDialog";
import { cn } from "@/lib/utils";
import type { CreateMessage, Message } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PdfUploadAgentProps {
  sessionId: string;
  className?: string;
  messages: Message[];
  append: (message: CreateMessage) => Promise<string | null | undefined>;
}

export const PdfUploadAgent = ({
  sessionId,
  className,
  messages,
  append,
}: PdfUploadAgentProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthPanelExpanded, setIsAuthPanelExpanded] = useState(true);
  const [isUploadPanelExpanded, setIsUploadPanelExpanded] = useState(true);
  const lastProcessedMessageId = useRef<string | null>(null);

  // Check authentication status by making direct API call
  const checkAuthStatus = useCallback(async () => {
    try {
      setCheckingAuth(true);
      setAuthError(null);

      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      // Use the is-session-authenticated endpoint for status checking
      const response = await fetch(
        `${apiBaseUrl}/pdf/is-session-authenticated?sessionId=${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = (await response.json()) as {
          authenticated: boolean;
        };

        if (result.authenticated) {
          setIsAuthenticated(true);
          setAuthError(null);
          setShowAuthInput(false);
        } else {
          setIsAuthenticated(false);
          setAuthError(null);
        }
      } else {
        const errorText = await response.text();
        console.error("Auth check failed:", response.status, errorText);
        setIsAuthenticated(false);
        setAuthError(null);
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      if (error instanceof Error && error.name === "AbortError") {
        setAuthError("Authentication check timed out");
      } else {
        setAuthError("Failed to check authentication status");
      }
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, [sessionId]);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Listen for agent responses to update authentication state
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      // Only log once per new message, not on every content update during streaming
      const messageId = lastMessage.id || lastMessage.content;
      if (messageId !== lastProcessedMessageId.current) {
        lastProcessedMessageId.current = messageId;
        const content = lastMessage.content;
        console.log("Agent response received:", {
          content: `${content.substring(0, 200)}...`,
          isAuthenticated: isAuthenticated,
          showAuthInput: showAuthInput,
        });
        // Only handle agent responses for non-auth operations
        // Authentication is now handled by direct HTTP calls
      }
    }
  }, [messages, isAuthenticated, showAuthInput]);

  const handleUpload = async (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => {
    setUploading(true);
    try {
      // Step 0: Check authentication status before proceeding
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const authStatusResponse = await fetch(
        `${apiBaseUrl}/pdf/is-session-authenticated?sessionId=${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const authStatus = (await authStatusResponse.json()) as {
        authenticated: boolean;
      };
      if (!authStatus.authenticated) {
        setUploading(false);
        setIsAuthenticated(false);
        setAuthError(
          "Session is not authenticated. Please re-authenticate before uploading."
        );
        setShowAuthInput(true);
        return;
      }

      // Step 1: Ask agent to generate upload URL with session ID
      await append({
        role: "user",
        content: `Please generate an upload URL for my PDF file "${filename}" (${(file.size / 1024 / 1024).toFixed(2)} MB) using session ID "${sessionId}".`,
      });

      // Step 2: Wait for agent response and extract upload URL
      // For now, we'll make a direct API call to get the upload URL
      // In a full implementation, you'd parse the agent's response to get the upload URL

      // Get upload URL from server (this would normally come from the agent's response)
      const uploadUrlResponse = await fetch(`${apiBaseUrl}/pdf/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileName: filename,
          fileSize: file.size,
        }),
      });

      console.log("Upload URL request sent with sessionId:", sessionId);
      console.log("Upload URL response status:", uploadUrlResponse.status);

      if (!uploadUrlResponse.ok) {
        const errorText = await uploadUrlResponse.text();
        console.error(
          "Upload URL request failed:",
          uploadUrlResponse.status,
          errorText
        );
        throw new Error(
          `Failed to get upload URL: ${uploadUrlResponse.status}`
        );
      }

      const uploadUrlResult = (await uploadUrlResponse.json()) as {
        uploadUrl: string;
        fileKey: string;
      };

      console.log("Upload URL result:", uploadUrlResult);
      console.log("API Base URL:", apiBaseUrl);
      console.log(
        "Full upload URL:",
        `${apiBaseUrl}${uploadUrlResult.uploadUrl}`
      );

      // Step 3: Upload file directly to R2 using the presigned URL
      const uploadResponse = await fetch(
        `${apiBaseUrl}${uploadUrlResult.uploadUrl}`,
        {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": "application/pdf",
          },
        }
      );

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // Step 4: Send metadata to agent after successful upload
      await append({
        role: "user",
        content: `I have successfully uploaded the PDF file "${filename}" (${(file.size / 1024 / 1024).toFixed(2)} MB) with file key "${uploadUrlResult.fileKey}". Please update the metadata with:
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
        content: `Failed to upload PDF file "${filename}": ${error instanceof Error ? error.message : String(error)}`,
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
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          providedKey: adminKey,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        authenticated: boolean;
        error?: string;
      };

      if (response.ok && result.success && result.authenticated) {
        // Authentication successful
        setIsAuthenticated(true);
        setAuthError(null);
        setShowAuthInput(false);
        setAdminKey("");

        // Send success message to agent
        await append({
          role: "user",
          content:
            "I have successfully authenticated for PDF upload functionality.",
        });
      } else {
        // Authentication failed
        setIsAuthenticated(false);
        setAuthError(
          result.error || "Authentication failed. Please check your admin key."
        );
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
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h3 className="text-ob-base-300 font-medium">
              PDF Upload Authentication
            </h3>
            <p className="text-ob-base-200 text-sm">
              You need to authenticate to upload and process PDF files.
            </p>
          </div>
          <Button
            onClick={() => setIsAuthPanelExpanded(!isAuthPanelExpanded)}
            variant="ghost"
            size="sm"
            className="text-ob-base-200 hover:text-ob-base-300"
          >
            {isAuthPanelExpanded ? "−" : "+"}
          </Button>
        </div>

        {isAuthPanelExpanded && (
          <>
            {authError && (
              <div className="text-ob-destructive text-sm">{authError}</div>
            )}

            {showAuthInput ? (
              <div className="space-y-3">
                <div className="space-y-3">
                  <label
                    htmlFor="admin-key"
                    className="text-ob-base-300 text-sm font-medium mb-2 block"
                  >
                    Admin Key
                  </label>
                  <Input
                    id="admin-key"
                    type="password"
                    placeholder="Enter admin key..."
                    value={adminKey}
                    onValueChange={(value) => setAdminKey(value)}
                    disabled={authenticating}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmitAuth();
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
          </>
        )}
      </Card>
    );
  }

  if (showUpload) {
    return (
      <UploadDialog
        onUpload={handleUpload}
        loading={uploading}
        className={className}
        onBack={() => setShowUpload(false)}
      />
    );
  }

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            You can now upload your campaign PDFs.
          </p>
        </div>
        <Button
          onClick={() => setIsUploadPanelExpanded(!isUploadPanelExpanded)}
          variant="ghost"
          size="sm"
          className="text-ob-base-200 hover:text-ob-base-300"
        >
          {isUploadPanelExpanded ? "−" : "+"}
        </Button>
      </div>

      {isUploadPanelExpanded && (
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
      )}
    </Card>
  );
};
