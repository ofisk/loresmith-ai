import { DurableObject } from "cloudflare:workers";

interface FileMetadata {
  fileKey: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "uploaded" | "parsing" | "parsed" | "error";
  uploadedAt: string;
  metadata?: Record<string, any>;
}

interface SessionData {
  isAuthenticated: boolean;
  authenticatedAt?: string;
  files: Map<string, FileMetadata>;
}

interface AddFileRequest {
  sessionId?: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  metadata?: Record<string, any>;
}

interface UpdateStatusRequest {
  fileKey: string;
  status: "uploading" | "uploaded" | "parsing" | "parsed" | "error";
}

interface RemoveFileRequest {
  fileKey: string;
}

interface ValidateAuthRequest {
  sessionId?: string;
  providedKey: string;
  expectedKey?: string;
}

interface UpdateMetadataRequest {
  fileKey: string;
  metadata: {
    description?: string;
    tags?: string[];
    originalName?: string;
    fileSize?: number;
    uploadedAt?: string;
  };
}

export class SessionFileTracker extends DurableObject {
  private sessionData: SessionData = {
    isAuthenticated: false,
    files: new Map(),
  };

  private readonly EXPECTED_ADMIN_KEY = "dev-admin-key-2024"; // In production, this should be a secret

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case "/add-file":
          return await this.addFile(request);
        case "/get-files":
          return await this.getFiles(request);
        case "/update-status":
          return await this.updateStatus(request);
        case "/remove-file":
          return await this.removeFile(request);
        case "/delete-session":
          return await this.deleteSession(request);
        case "/validate-session-auth":
          return await this.validateSessionAuth(request);
        case "/is-session-authenticated":
          return await this.isSessionAuthenticated(request);
        case "/get-session-auth-info":
          return await this.getSessionAuthInfo(request);
        case "/update-metadata":
          return await this.updateMetadata(request);
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      console.error("SessionFileTracker error:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  private async addFile(request: Request): Promise<Response> {
    const { fileKey, fileName, fileSize, metadata } =
      (await request.json()) as AddFileRequest;

    // Check if this session is already authenticated
    if (!this.sessionData.isAuthenticated) {
      return new Response("Session not authenticated", { status: 401 });
    }

    const fileData: FileMetadata = {
      fileKey,
      fileName,
      fileSize,
      status: "uploading",
      uploadedAt: new Date().toISOString(),
      metadata,
    };

    this.sessionData.files.set(fileKey, fileData);

    return new Response(JSON.stringify({ success: true, fileData }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async getFiles(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      return new Response("sessionId parameter required", { status: 400 });
    }

    const files = Array.from(this.sessionData.files.values());

    return new Response(JSON.stringify({ files }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async updateStatus(request: Request): Promise<Response> {
    const { fileKey, status } = (await request.json()) as UpdateStatusRequest;

    if (!this.sessionData.isAuthenticated) {
      return new Response("Session not authenticated", { status: 401 });
    }

    const file = this.sessionData.files.get(fileKey);
    if (!file) {
      return new Response("File not found", { status: 404 });
    }

    file.status = status;

    return new Response(JSON.stringify({ success: true, file }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async removeFile(request: Request): Promise<Response> {
    const { fileKey } = (await request.json()) as RemoveFileRequest;

    if (!this.sessionData.isAuthenticated) {
      return new Response("Session not authenticated", { status: 401 });
    }

    const deleted = this.sessionData.files.delete(fileKey);

    return new Response(JSON.stringify({ success: deleted }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async deleteSession(request: Request): Promise<Response> {
    if (!this.sessionData.isAuthenticated) {
      return new Response("Session not authenticated", { status: 401 });
    }

    this.sessionData = {
      isAuthenticated: false,
      files: new Map(),
    };

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async validateSessionAuth(request: Request): Promise<Response> {
    const { providedKey, expectedKey } =
      (await request.json()) as ValidateAuthRequest;

    // If session is already authenticated, return success without checking the key again
    if (this.sessionData.isAuthenticated) {
      return new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          authenticatedAt: this.sessionData.authenticatedAt,
          message: "Session already authenticated",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const keyToCheck = expectedKey || this.EXPECTED_ADMIN_KEY;

    if (providedKey === keyToCheck) {
      this.sessionData.isAuthenticated = true;
      this.sessionData.authenticatedAt = new Date().toISOString();

      return new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          authenticatedAt: this.sessionData.authenticatedAt,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          authenticated: false,
          error: "Invalid admin key",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  private async isSessionAuthenticated(request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        authenticated: this.sessionData.isAuthenticated,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async getSessionAuthInfo(request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({
        isAuthenticated: this.sessionData.isAuthenticated,
        authenticatedAt: this.sessionData.authenticatedAt,
        fileCount: this.sessionData.files.size,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async updateMetadata(request: Request): Promise<Response> {
    const { fileKey, metadata } =
      (await request.json()) as UpdateMetadataRequest;

    if (!this.sessionData.isAuthenticated) {
      return new Response("Session not authenticated", { status: 401 });
    }

    const file = this.sessionData.files.get(fileKey);
    if (!file) {
      return new Response("File not found", { status: 404 });
    }

    // Update file metadata
    file.metadata = {
      ...file.metadata,
      ...metadata,
    };

    // Update file size if provided
    if (metadata.fileSize) {
      file.fileSize = metadata.fileSize;
    }

    return new Response(JSON.stringify({ success: true, file }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
