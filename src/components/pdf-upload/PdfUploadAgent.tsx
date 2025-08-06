import { useEffect, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";
import { cn } from "@/lib/utils";
import {
  API_CONFIG,
  PDF_PROCESSING_CONFIG,
  USER_MESSAGES,
} from "../../constants";
import { useJwtExpiration } from "../../hooks/useJwtExpiration";
import {
  authenticatedFetchWithExpiration,
  clearJwt,
  getStoredJwt,
  storeJwt,
} from "../../services/auth-service";
import type { ProcessingProgress } from "../../types/progress";

import { PdfList } from "./PdfList";
import { PdfUpload } from "./PdfUpload";

interface PdfUploadAgentProps {
  className?: string;
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

export const PdfUploadAgent = ({ className }: PdfUploadAgentProps) => {
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

  const [username, setUsername] = useState("");
  const [jwtUsername, setJwtUsername] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [refreshTrigger, _setRefreshTrigger] = useState(0);
  const [uploadProgress, setUploadProgress] =
    useState<ProcessingProgress | null>(null);

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
  useEffect(() => {}, []);

  const handleUpload = async (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => {
    console.log("[Client] handleUpload called with:", {
      filename,
      description,
      tags,
      fileSize: file.size,
    });
    setUploading(true);

    // Use optimized configuration for better upload performance
    const MAX_CONCURRENT_UPLOADS = PDF_PROCESSING_CONFIG.MAX_CONCURRENT_UPLOADS; // 5 concurrent uploads

    const initialProgress: ProcessingProgress = {
      fileKey: `${jwtUsername}/${filename}`,
      username: jwtUsername || "unknown",
      startTime: Date.now(),
      overallProgress: 0,
      currentStep: "Preparing upload...",
      status: "processing",
      steps: [
        {
          id: "upload",
          name: "Uploading file",
          description: `Uploading chunks`,
          status: "processing",
          progress: 0,
        },
        {
          id: "indexing",
          name: "Indexing content",
          description: "Processing and extracting text",
          status: "pending",
          progress: 0,
        },
        {
          id: "metadata",
          name: "Generating metadata",
          description: "Creating description and tags",
          status: "pending",
          progress: 0,
        },
      ],
    };

    setUploadProgress(initialProgress);

    try {
      const jwt = getStoredJwt();
      if (!jwt) {
        setUploading(false);
        setIsAuthenticated(false);
        setAuthError("Not authenticated. Please re-authenticate.");
        setShowAuthInput(true);
        return;
      }

      console.log("[Client] Starting upload process...");

      // Step 1: Get upload URL
      console.log("[Client] Getting upload URL...");
      const uploadUrlEndpoint = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL
      );
      console.log("[Client] Upload URL endpoint:", uploadUrlEndpoint);
      console.log("[Client] Full upload URL:", uploadUrlEndpoint);
      console.log("[Client] Request payload:", {
        filename: filename,
        contentType: "application/pdf",
      });

      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              currentStep: "Getting upload URL...",
              overallProgress: 5,
            }
          : null
      );

      let uploadUrlResponse: any;
      let jwtExpired = false;

      try {
        const result = await authenticatedFetchWithExpiration(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              filename: filename,
              contentType: "application/pdf",
              fileSize: file.size,
            }),
          }
        );

        uploadUrlResponse = result.response;
        jwtExpired = result.jwtExpired;

        console.log(
          "[Client] Upload URL response status:",
          uploadUrlResponse.status
        );
        console.log("[Client] Upload URL response headers:", {
          contentType: uploadUrlResponse.headers.get("content-type"),
          contentLength: uploadUrlResponse.headers.get("content-length"),
        });
      } catch (error) {
        console.error("[Client] Error making upload URL request:", error);
        throw new Error(`Failed to make upload URL request: ${error}`);
      }

      if (jwtExpired) {
        console.log("[Client] JWT expired during upload URL request");
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
        console.error("[Client] Upload URL request failed:", errorText);
        throw new Error(
          `Failed to get upload URL: ${uploadUrlResponse.status} ${errorText}`
        );
      }

      const uploadUrlData = (await uploadUrlResponse.json()) as {
        uploadId: string;
        fileKey: string;
        chunkSize: number;
        totalParts: number;
        sessionId: string; // Added sessionId
      };

      console.log("[Client] Upload URL data:", uploadUrlData);

      // Step 2: Upload file using optimized parallel chunks with retry logic
      console.log("[Client] Uploading file using optimized parallel chunks...");

      const parts: { partNumber: number; etag: string }[] = [];
      const uploadStartTime = Date.now();

      // Create upload function for a single chunk with retry logic
      const uploadChunk = async (
        chunkIndex: number,
        retryCount = 0
      ): Promise<{ partNumber: number; etag: string }> => {
        const start = chunkIndex * uploadUrlData.chunkSize;
        const end = Math.min(start + uploadUrlData.chunkSize, file.size);
        const chunk = file.slice(start, end);
        const partNumber = chunkIndex + 1;

        console.log(
          `[Client] Starting upload for chunk ${partNumber}/${uploadUrlData.totalParts} (${chunk.size} bytes)`
        );

        // Update progress for this chunk
        const chunkProgress = (chunkIndex / uploadUrlData.totalParts) * 80; // Upload takes 80% of total progress
        setUploadProgress((prev) =>
          prev
            ? {
                ...prev,
                currentStep: `Uploading chunk ${partNumber}/${uploadUrlData.totalParts}`,
                overallProgress: 10 + chunkProgress,
                steps: prev.steps.map((step) =>
                  step.id === "upload"
                    ? {
                        ...step,
                        progress: Math.round(
                          (chunkIndex / uploadUrlData.totalParts) * 100
                        ),
                      }
                    : step
                ),
              }
            : null
        );

        try {
          // Use the original chunk for now (compression can be added later if needed)
          const chunkToUpload = chunk;

          const formData = new FormData();
          formData.append("file", chunkToUpload);
          formData.append("sessionId", uploadUrlData.sessionId);
          formData.append("partNumber", partNumber.toString());

          const chunkUploadUrl = `${API_CONFIG.getApiBaseUrl()}/upload/part`;
          console.log(
            `[Client] Uploading chunk ${partNumber} to:`,
            chunkUploadUrl
          );
          console.log(`[Client] Full chunk upload URL:`, chunkUploadUrl);
          console.log(`[Client] Chunk ${partNumber} details:`, {
            sessionId: uploadUrlData.sessionId,
            partNumber: partNumber,
            chunkSize: chunkToUpload.size,
          });

          let uploadResponse: Response;
          try {
            uploadResponse = await fetch(
              `${API_CONFIG.getApiBaseUrl()}/upload/part`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${jwt}`,
                },
                body: formData,
              }
            );
          } catch (error) {
            console.error(
              `[Client] Error making chunk ${partNumber} upload request:`,
              error
            );
            throw new Error(
              `Failed to make chunk ${partNumber} upload request: ${error}`
            );
          }

          console.log(
            `[Client] Chunk ${partNumber} upload response status:`,
            uploadResponse.status
          );
          console.log(`[Client] Chunk ${partNumber} upload response headers:`, {
            contentType: uploadResponse.headers.get("content-type"),
            contentLength: uploadResponse.headers.get("content-length"),
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error(
              `[Client] Chunk ${partNumber} upload failed:`,
              errorText
            );

            // Retry logic for failed uploads
            if (retryCount < 2) {
              console.log(
                `[Client] Retrying chunk ${partNumber} (attempt ${retryCount + 1})`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (retryCount + 1))
              ); // Exponential backoff
              return uploadChunk(chunkIndex, retryCount + 1);
            }

            throw new Error(
              `Chunk ${partNumber} upload failed after ${retryCount + 1} attempts: ${uploadResponse.status} ${errorText}`
            );
          }

          const uploadResult = (await uploadResponse.json()) as {
            success: boolean;
            fileKey: string;
            partNumber: number;
            etag: string;
          };
          console.log(
            `[Client] Chunk ${partNumber} upload result:`,
            uploadResult
          );

          return {
            partNumber: uploadResult.partNumber,
            etag: uploadResult.etag,
          };
        } catch (error) {
          console.error(`[Client] Error uploading chunk ${partNumber}:`, error);

          // Retry logic for network errors
          if (
            retryCount < 2 &&
            error instanceof Error &&
            error.message.includes("network")
          ) {
            console.log(
              `[Client] Retrying chunk ${partNumber} due to network error (attempt ${retryCount + 1})`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 2000 * (retryCount + 1))
            );
            return uploadChunk(chunkIndex, retryCount + 1);
          }

          throw error;
        }
      };

      // Upload chunks in parallel with concurrency limit and better error handling
      for (
        let i = 0;
        i < uploadUrlData.totalParts;
        i += MAX_CONCURRENT_UPLOADS
      ) {
        const batch = [];
        for (
          let j = 0;
          j < MAX_CONCURRENT_UPLOADS && i + j < uploadUrlData.totalParts;
          j++
        ) {
          batch.push(uploadChunk(i + j));
        }

        try {
          const batchResults = await Promise.allSettled(batch);

          // Check for failed uploads
          const failedUploads = batchResults.filter(
            (result) => result.status === "rejected"
          );
          if (failedUploads.length > 0) {
            console.error(
              `[Client] ${failedUploads.length} uploads failed in batch`
            );
            throw new Error(
              `Upload batch failed: ${failedUploads.length} chunks failed`
            );
          }

          const successfulResults = batchResults
            .filter(
              (
                result
              ): result is PromiseFulfilledResult<{
                partNumber: number;
                etag: string;
              }> => result.status === "fulfilled"
            )
            .map((result) => result.value);

          parts.push(...successfulResults);

          // Update progress after each batch
          const completedChunks = Math.min(
            i + MAX_CONCURRENT_UPLOADS,
            uploadUrlData.totalParts
          );
          const overallProgress =
            10 + (completedChunks / uploadUrlData.totalParts) * 80;
          setUploadProgress((prev) =>
            prev
              ? {
                  ...prev,
                  currentStep: `Uploaded ${completedChunks}/${uploadUrlData.totalParts} chunks`,
                  overallProgress,
                  steps: prev.steps.map((step) =>
                    step.id === "upload"
                      ? {
                          ...step,
                          progress: Math.round(
                            (completedChunks / uploadUrlData.totalParts) * 100
                          ),
                        }
                      : step
                  ),
                }
              : null
          );
        } catch (error) {
          console.error("[Client] Batch upload failed:", error);
          throw error;
        }
      }

      // Sort parts by part number to ensure correct order
      parts.sort((a, b) => a.partNumber - b.partNumber);

      const uploadEndTime = Date.now();
      const uploadDuration = (uploadEndTime - uploadStartTime) / 1000;
      console.log(`[Client] Upload completed in ${uploadDuration.toFixed(2)}s`);

      // Step 3: Complete the upload
      console.log("[Client] Completing upload with all parts...");
      const completionUrl = `${API_CONFIG.getApiBaseUrl()}/upload/complete`;
      console.log("[Client] Completion request details:", {
        url: completionUrl,
        sessionId: uploadUrlData.sessionId,
        partsCount: parts.length,
        parts: parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      });
      console.log("[Client] Full completion URL:", completionUrl);

      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              currentStep: "Completing upload...",
              overallProgress: 90,
              steps: prev.steps.map((step) =>
                step.id === "upload"
                  ? { ...step, status: "completed", progress: 100 }
                  : step
              ),
            }
          : null
      );

      const completeResponse = await fetch(
        `${API_CONFIG.getApiBaseUrl()}/upload/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            sessionId: uploadUrlData.sessionId,
          }),
        }
      );

      console.log(
        "[Client] Completion response status:",
        completeResponse.status
      );
      console.log("[Client] Completion response headers:", {
        contentType: completeResponse.headers.get("content-type"),
        contentLength: completeResponse.headers.get("content-length"),
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.error("[Client] Complete upload failed:", errorText);
        throw new Error(
          `Upload failed: ${completeResponse.status} ${errorText}`
        );
      } else {
        console.log("[Client] Upload completed successfully!");
      }

      // Step 4: Process the uploaded file directly
      console.log("[Client] Processing uploaded file...");
      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              currentStep: "Processing content...",
              overallProgress: 95,
              steps: prev.steps.map((step) =>
                step.id === "indexing"
                  ? { ...step, status: "processing", progress: 50 }
                  : step
              ),
            }
          : null
      );

      // Process the file using the ingest endpoint
      try {
        const processResponse = await fetch(
          `${API_CONFIG.getApiBaseUrl()}/pdf/ingest`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              fileKey: uploadUrlData.fileKey,
              filename: filename,
              description: description || "",
              tags: tags,
              fileSize: file.size,
            }),
          }
        );

        if (!processResponse.ok) {
          const errorText = await processResponse.text();
          console.error("[Client] File processing failed:", errorText);
          throw new Error(
            `Processing failed: ${processResponse.status} ${errorText}`
          );
        }

        const processResult = await processResponse.json();
        console.log("[Client] File processing completed:", processResult);

        // Update progress to show completion
        setUploadProgress((prev) =>
          prev
            ? {
                ...prev,
                currentStep: "Upload and processing complete!",
                overallProgress: 100,
                steps: prev.steps.map((step) =>
                  step.id === "indexing"
                    ? { ...step, status: "completed", progress: 100 }
                    : step
                ),
              }
            : null
        );

        // Close the modal after successful upload
        setTimeout(() => {
          setIsAddModalOpen(false);
          setUploadProgress(null);
        }, 2000); // Show completion for 2 seconds
      } catch (error) {
        console.error("[Client] Error processing file:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error uploading PDF:", error);

      // Update progress to show error
      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              currentStep: "Upload failed",
              error: error instanceof Error ? error.message : String(error),
              steps: prev.steps.map((step) =>
                step.status === "processing"
                  ? {
                      ...step,
                      status: "error",
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  : step
              ),
            }
          : null
      );
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

        // Removed agent message for successful authentication
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
          uploadProgress={uploadProgress}
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
