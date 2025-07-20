import type { CreateMessage, Message } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { Modal } from "@/components/modal/Modal";
import { cn } from "@/lib/utils";
import { API_CONFIG, USER_MESSAGES } from "../../constants";
import { useJwtExpiration } from "../../hooks/useJwtExpiration";
import { authenticatedFetchWithExpiration } from "../../lib/auth";
import { PdfList } from "./PdfList";
import { PdfUpload } from "./PdfUpload";

interface PdfUploadAgentProps {
  className?: string;
  messages: Message[];
  append: (message: CreateMessage) => Promise<string | null | undefined>;
}

const JWT_STORAGE_KEY = "pdf_auth_jwt";

function getStoredJwt(): string | null {
  return localStorage.getItem(JWT_STORAGE_KEY);
}

function storeJwt(token: string) {
  localStorage.setItem(JWT_STORAGE_KEY, token);
}

function clearJwt() {
  localStorage.removeItem(JWT_STORAGE_KEY);
}

// Helper function to handle JWT expiration consistently
function handleJwtExpiration(
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
  const [authenticating, setAuthenticating] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthPanelExpanded, setIsAuthPanelExpanded] = useState(true);

  const lastProcessedMessageId = useRef<string | null>(null);
  const [username, setUsername] = useState("");
  const [jwtUsername, setJwtUsername] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);

  // Use JWT expiration hook
  const { isExpired, clearExpiration } = useJwtExpiration({
    onExpiration: () => {
      handleJwtExpiration(
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

  // On mount, check for JWT
  useEffect(() => {
    const jwt = getStoredJwt();
    if (!jwt) {
      setIsAuthenticated(false);
      setJwtUsername(null);
      setCheckingAuth(false);
      return;
    }

    // Check if JWT is expired
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload?.exp && payload.exp < currentTime) {
        // JWT is expired, clear it and show auth
        handleJwtExpiration(
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
  }, [clearExpiration]);

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
              fileName: filename,
              fileSize: file.size,
            }),
          }
        );

      if (jwtExpired) {
        handleJwtExpiration(
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
      // Step 3: Upload file directly to R2 using the presigned URL
      const uploadResponse = await fetch(
        `${API_CONFIG.getApiBaseUrl()}${uploadUrlResult.uploadUrl}`,
        {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": "application/pdf",
            Authorization: `Bearer ${jwt}`,
          },
        }
      );
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }
      // Step 4: Send metadata to agent after successful upload
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
    if (!username.trim()) {
      setAuthError("Please enter your username");
      return;
    }
    try {
      setAuthenticating(true);
      setAuthError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.AUTHENTICATE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: adminKey,
            username: username.trim(),
          }),
        }
      );
      const result = (await response.json()) as {
        token?: string;
        error?: string;
      };
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
        // Clear any expiration state since we now have a valid JWT
        clearExpiration();
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
          <h3 className="text-ob-base-300 font-medium">Add Resources</h3>
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
                  <label
                    htmlFor="username"
                    className="text-ob-base-300 text-sm font-medium mb-2 block"
                  >
                    Username
                  </label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username..."
                    value={username}
                    onValueChange={(value: string) => setUsername(value)}
                    disabled={authenticating}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") handleSubmitAuth();
                    }}
                  />
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
                    onValueChange={(value: string) => setAdminKey(value)}
                    disabled={authenticating}
                    onKeyDown={(e: React.KeyboardEvent) => {
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
          Add Resources
        </Button>
        <Button
          onClick={() => setIsListModalOpen(true)}
          variant="secondary"
          size="base"
        >
          Show Resources
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
        <PdfList />
      </Modal>
    </Card>
  );
};
