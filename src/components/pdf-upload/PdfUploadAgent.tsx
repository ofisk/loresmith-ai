import type { CreateMessage, Message } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";
import { cn } from "@/lib/utils";
import { API_CONFIG, USER_MESSAGES } from "../../constants";
import { useJwtExpiration } from "../../hooks/useJwtExpiration";
import {
  authenticatedFetchWithExpiration,
  clearJwt,
  getStoredJwt,
  storeJwt,
} from "../../services/auth-service";
import { PdfList } from "./PdfList";
import { PdfUpload } from "./PdfUpload";

interface PdfUploadAgentProps {
  className?: string;
  messages: Message[];
  append: (message: CreateMessage) => Promise<string | null | undefined>;
}

// Helper function to handle JWT expiration consistently
function handleJwtExpirationLocal(
  clearJwt: () => void,
  setIsAuthenticated: (value: boolean) => void,
  setJwtUsername: (value: string | null) => void,
  setAuthError: (value: string | null) => void,
  setShowAuthInput: (value: boolean) => void,
  setUploading?: (value: boolean) => void,
  setCheckingAuth?: (value: boolean) => void
) {
  clearJwt();
  setIsAuthenticated(false);
  setJwtUsername(null);
  setAuthError(USER_MESSAGES.SESSION_EXPIRED);
  setShowAuthInput(true);

  // Optional cleanup functions
  if (setUploading) setUploading(false);
  if (setCheckingAuth) setCheckingAuth(false);
}

export const PdfUploadAgent = ({
  className,
  messages,
  append,
}: PdfUploadAgentProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthPanelExpanded, setIsAuthPanelExpanded] = useState(true);
  const [requiresOpenAIKey, setRequiresOpenAIKey] = useState(false);

  const lastProcessedMessageId = useRef<string | null>(null);
  const [username, setUsername] = useState("");
  const [jwtUsername, setJwtUsername] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [refreshTrigger, _setRefreshTrigger] = useState(0);

  // Use JWT expiration hook
  const { isExpired, clearExpiration } = useJwtExpiration({
    onExpiration: () => {
      handleJwtExpirationLocal(
        clearJwt,
        setIsAuthenticated,
        setJwtUsername,
        setAuthError,
        setShowAuthInput
      );
    },
    checkOnMount: true,
  });

  const effectiveIsAuthenticated = isAuthenticated && !isExpired;

  // On mount, check for JWT and default OpenAI key
  useEffect(() => {
    const checkAuthAndOpenAI = async () => {
      const jwt = getStoredJwt();
      if (!jwt) {
        setIsAuthenticated(false);
        setJwtUsername(null);
        setCheckingAuth(false);

        // Also check if we need to require OpenAI key when not authenticated
        try {
          // Extract username from JWT if available
          let username = null;
          if (jwt) {
            try {
              const payload = JSON.parse(atob(jwt.split(".")[1]));
              username = payload?.username;
            } catch {
              // JWT parsing failed, continue without username
            }
          }

          const url = username
            ? `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY)}?username=${encodeURIComponent(username)}`
            : API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY);

          const response = await fetch(url);
          const result = (await response.json()) as { success: boolean };
          console.log("Initial OpenAI key check:", result);

          if (!result.success) {
            console.log("Setting requiresOpenAIKey to true on mount");
            setRequiresOpenAIKey(true);
          }
        } catch (error) {
          console.error("Error checking OpenAI key on mount:", error);
          setRequiresOpenAIKey(true);
        }

        return;
      }

      // Check if JWT is expired
      try {
        const payload = JSON.parse(atob(jwt.split(".")[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload?.exp && payload.exp < currentTime) {
          // JWT is expired, clear it and show auth
          handleJwtExpirationLocal(
            clearJwt,
            setIsAuthenticated,
            setJwtUsername,
            setAuthError,
            setShowAuthInput,
            undefined,
            setCheckingAuth
          );
          return;
        }

        if (payload?.username) {
          setJwtUsername(payload.username);
        } else {
          setJwtUsername(null);
        }
      } catch {
        // Invalid JWT, clear it
        clearJwt();
        setJwtUsername(null);
        setIsAuthenticated(false);
        setCheckingAuth(false);
        return;
      }

      setIsAuthenticated(true);
      // Clear any expiration state since we have a valid JWT
      clearExpiration();
      setCheckingAuth(false);
    };

    checkAuthAndOpenAI();
  }, [clearExpiration]);

  // Check OpenAI key requirement when authentication form is shown
  useEffect(() => {
    if (showAuthInput && !isAuthenticated) {
      const checkOpenAIRequirement = async () => {
        try {
          // Extract username from JWT if available
          let username = null;
          const jwt = getStoredJwt();
          if (jwt) {
            try {
              const payload = JSON.parse(atob(jwt.split(".")[1]));
              username = payload?.username;
            } catch {
              // JWT parsing failed, continue without username
            }
          }

          const url = username
            ? `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY)}?username=${encodeURIComponent(username)}`
            : API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY);

          const response = await fetch(url);
          const result = (await response.json()) as { success: boolean };
          console.log("Auth form OpenAI key check:", result);

          if (!result.success) {
            console.log("Setting requiresOpenAIKey to true for auth form");
            setRequiresOpenAIKey(true);
          } else {
            console.log("Setting requiresOpenAIKey to false for auth form");
            setRequiresOpenAIKey(false);
          }
        } catch (error) {
          console.error("Error checking OpenAI key for auth form:", error);
          setRequiresOpenAIKey(true);
        }
      };

      checkOpenAIRequirement();
    }
  }, [showAuthInput, isAuthenticated]);

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
      const jwt = getStoredJwt();
      if (!jwt) {
        setUploading(false);
        setIsAuthenticated(false);
        setAuthError("Not authenticated. Please re-authenticate.");
        setShowAuthInput(true);
        return;
      }
      // Step 1: Ask agent to generate upload URL
      console.log("[Client] Calling append for upload with JWT:", jwt);
      await append({
        role: "user",
        content: `Please generate an upload URL for my PDF file "${filename}" (${(file.size / 1024 / 1024).toFixed(2)} MB).`,
        data: { jwt },
      });
      // Step 2: Get upload URL from server (send JWT)
      const { response: uploadUrlResponse, jwtExpired } =
        await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              filename: filename,
              contentType: "application/pdf",
            }),
          }
        );

      if (jwtExpired) {
        handleJwtExpirationLocal(
          clearJwt,
          setIsAuthenticated,
          setJwtUsername,
          setAuthError,
          setShowAuthInput,
          setUploading
        );
        return;
      }

      if (!uploadUrlResponse.ok) {
        const errorText = await uploadUrlResponse.text();
        throw new Error(
          `Failed to get upload URL: ${uploadUrlResponse.status} ${errorText}`
        );
      }
      const uploadUrlResult = (await uploadUrlResponse.json()) as {
        uploadUrl: string;
        fileKey: string;
      };

      // Step 3: Upload file directly to R2 using multipart upload
      console.log("[Client] Upload ID received:", uploadUrlResult.uploadUrl);
      console.log("[Client] File key:", uploadUrlResult.fileKey);

      // Upload the file using the multipart upload ID
      const uploadResponse = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/pdf/upload-part`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            fileKey: uploadUrlResult.fileKey,
            uploadId: uploadUrlResult.uploadUrl,
            partNumber: 1,
            file: await file.arrayBuffer(),
          }),
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
      }

      const uploadResult = (await uploadResponse.json()) as {
        success: boolean;
        fileKey: string;
        partNumber: number;
        etag: string;
      };
      console.log("[Client] Upload part result:", uploadResult);

      // Step 4: Complete the multipart upload
      const completeResponse = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/pdf/upload/${encodeURIComponent(uploadUrlResult.fileKey)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            uploadId: uploadUrlResult.uploadUrl,
            parts: [{ partNumber: 1, etag: uploadResult.etag }],
          }),
        }
      );

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.warn(
          `Complete upload failed: ${completeResponse.status} ${errorText}`
        );
        throw new Error(
          `Complete upload failed: ${completeResponse.status} ${errorText}`
        );
      }

      // Step 5: Send metadata to agent after successful upload
      console.log("[Client] Calling append for metadata/ingest with JWT:", jwt);
      await append({
        role: "user",
        content: `I have successfully uploaded the PDF file "${filename}" (${(file.size / 1024 / 1024).toFixed(2)} MB) with file key "${uploadUrlResult.fileKey}". Please update the metadata with:\n- Description: ${description || "No description provided"}\n- Tags: ${tags.length > 0 ? tags.join(", ") : "No tags provided"}\n- File size: ${file.size} bytes\n\nThen please trigger ingestion for this file.`,
        data: { jwt },
      });
    } catch (error) {
      console.error("Error uploading PDF:", error);
      await append({
        role: "user",
        content: `Failed to upload PDF file "${filename}": ${error instanceof Error ? error.message : String(error)}`,
        data: { jwt: getStoredJwt() },
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAuthenticate = async () => {
    try {
      setAuthError(null);
      setShowAuthInput(true); // Show the form immediately

      // Check if a default OpenAI key is available
      try {
        // Extract username from JWT if available
        let username = null;
        const jwt = getStoredJwt();
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload?.username;
          } catch {
            // JWT parsing failed, continue without username
          }
        }

        const url = username
          ? `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY)}?username=${encodeURIComponent(username)}`
          : API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.OPENAI.CHECK_KEY);

        const response = await fetch(url);
        const result = (await response.json()) as { success: boolean };

        console.log("OpenAI key check result:", result);

        if (!result.success) {
          console.log("Setting requiresOpenAIKey to true");
          setRequiresOpenAIKey(true);
        } else {
          console.log("Setting requiresOpenAIKey to false");
          setRequiresOpenAIKey(false);
        }
      } catch (error) {
        console.error("Error checking OpenAI key availability:", error);
        // If we can't check, assume we need a key
        console.log("Error occurred, setting requiresOpenAIKey to true");
        setRequiresOpenAIKey(true);
      }
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
    if (!username.trim()) {
      setAuthError("Please enter your username");
      return;
    }

    try {
      setAuthenticating(true);
      setAuthError(null);
      // Get the session ID from localStorage to ensure we target the correct Chat Durable Object
      const sessionId = localStorage.getItem("chat-session-id") || "default";

      const requestBody = {
        providedKey: adminKey,
        username: username.trim(),
      };

      console.log("[handleSubmitAuth] Sending authentication request:", {
        requestBody,
      });

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": sessionId, // Include session ID to target the correct Chat Durable Object
          },
          body: JSON.stringify(requestBody),
        }
      );
      const result = (await response.json()) as {
        token?: string;
        error?: string;
        requiresOpenAIKey?: boolean;
        hasDefaultOpenAIKey?: boolean;
      };

      if (response.status === 400 && result.requiresOpenAIKey) {
        setRequiresOpenAIKey(true);
        setAuthError(
          "OpenAI API key is required when no default key is configured"
        );
        return;
      }

      if (response.ok && result.token) {
        storeJwt(result.token);
        // Decode JWT to get username
        try {
          const payload = JSON.parse(atob(result.token.split(".")[1]));
          if (payload?.username) {
            setJwtUsername(payload.username);
          } else {
            setJwtUsername(null);
          }
        } catch {
          setJwtUsername(null);
        }
        setIsAuthenticated(true);
        setAuthError(null);
        setShowAuthInput(false);
        setAdminKey("");
        setUsername("");
        setOpenaiApiKey("");
        setRequiresOpenAIKey(false);
        // Clear any expiration state since we now have a valid JWT
        clearExpiration();

        // If user provided an OpenAI key, set it in the Chat durable object
        if (result.token && requiresOpenAIKey && openaiApiKey.trim()) {
          try {
            await fetch(API_CONFIG.buildUrl("/chat/set-openai-key"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${result.token}`,
              },
              body: JSON.stringify({ openaiApiKey: openaiApiKey.trim() }),
            });
          } catch (error) {
            console.error("Error setting OpenAI API key in Chat:", error);
          }
        }

        await append({
          role: "user",
          content:
            "I have successfully authenticated for PDF upload functionality.",
          data: { jwt: result.token },
        });
      } else {
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
          <h3 className="text-ob-base-300 font-medium">Add to Library</h3>
          <p className="text-ob-base-200 text-sm">
            Checking authentication status...
          </p>
        </div>
      </Card>
    );
  }

  if (!effectiveIsAuthenticated) {
    // Show authentication UI
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h3 className="text-ob-base-300 font-medium">
              Loresmith Authentication
            </h3>
            <p className="text-ob-base-200 text-sm">
              Utter the secret words, adventurer, and the gates shall open.
              Speak your name as well, that we may recover the tomes of your
              past journeys.
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
                  <FormField
                    id="username"
                    label="Username"
                    placeholder="Enter your username..."
                    value={username}
                    onValueChange={(value, _isValid) => setUsername(value)}
                    disabled={authenticating}
                    onKeyPress={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") handleSubmitAuth();
                    }}
                  />
                  <FormField
                    id="admin-key"
                    label="Admin Key"
                    placeholder="Enter admin key..."
                    value={adminKey}
                    onValueChange={(value, _isValid) => setAdminKey(value)}
                    disabled={authenticating}
                    onKeyPress={(e: React.KeyboardEvent) => {
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
                    disabled={
                      !adminKey.trim() || !username.trim() || authenticating
                    }
                  >
                    {authenticating ? "Authenticating..." : "Authenticate"}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowAuthInput(false);
                      setAdminKey("");
                      setUsername("");
                      setOpenaiApiKey("");
                      setRequiresOpenAIKey(false);
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

  // Show upload UI
  return (
    <Card className={cn("space-y-4 relative", className)}>
      <div className="flex justify-center gap-6 mb-2">
        <Button
          onClick={() => setIsAddModalOpen(true)}
          variant="secondary"
          size="base"
        >
          Add to library
        </Button>
        <Button
          onClick={() => {
            setIsListModalOpen(true);
            // Trigger refresh when opening the modal
            _setRefreshTrigger((prev) => prev + 1);
          }}
          variant="secondary"
          size="base"
        >
          Show library
        </Button>
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        cardStyle={{ width: 560, height: 560 }}
      >
        <PdfUpload
          onUpload={handleUpload}
          loading={uploading}
          className="border-0 p-0 shadow-none"
          jwtUsername={jwtUsername}
        />
      </Modal>
      <Modal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        cardStyle={{ width: 560, height: 560 }}
      >
        <PdfList refreshTrigger={refreshTrigger} />
      </Modal>
    </Card>
  );
};
