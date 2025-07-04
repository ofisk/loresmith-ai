import { DurableObject } from "cloudflare:workers";

export interface FileMetadata {
  id: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  status: "uploading" | "uploaded" | "parsing" | "parsed" | "error";
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
    fileName?: string;
    originalName?: string;
    fileSize?: number;
    createdAt?: string;
  };
}

export class SessionFileTracker extends DurableObject {
  private sessionData: SessionData = {
    isAuthenticated: false,
    files: new Map(),
  };

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log("Durable Object: fetch called with path:", path);
    console.log(
      "Durable Object: current isAuthenticated =",
      this.sessionData.isAuthenticated
    );

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

    console.log("Durable Object: addFile called");
    console.log(
      "Durable Object: current isAuthenticated =",
      this.sessionData.isAuthenticated
    );
    console.log("Durable Object: fileKey =", fileKey);
    console.log("Durable Object: fileName =", fileName);

    // Check if this session is already authenticated
    if (!this.sessionData.isAuthenticated) {
      console.log(
        "Durable Object: Session not authenticated for addFile, returning 401"
      );
      return new Response("Session not authenticated", { status: 401 });
    }

    console.log("Durable Object: Session authenticated, adding file");

    const fileData: FileMetadata = {
      id: crypto.randomUUID(),
      fileKey,
      fileName,
      fileSize,
      status: "uploading",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
    };

    this.sessionData.files.set(fileKey, fileData);

    console.log("Durable Object: File added successfully");

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
    file.updatedAt = new Date().toISOString();

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

    // Use the expectedKey passed from the server (which comes from environment variable)
    if (!expectedKey) {
      return new Response(
        JSON.stringify({
          success: false,
          authenticated: false,
          error: "No expected key provided",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("Durable Object: providedKey =", providedKey);
    console.log("Durable Object: expectedKey =", expectedKey);

    if (providedKey === expectedKey) {
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
    }

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
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("fileKey" in body) ||
      !("metadata" in body) ||
      typeof (body as Record<string, unknown>).fileKey !== "string" ||
      typeof (body as Record<string, unknown>).metadata !== "object" ||
      (body as Record<string, unknown>).metadata === null
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid request: fileKey and metadata are required.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { fileKey, metadata } = body as UpdateMetadataRequest;

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

    // Update fileName if provided (this allows users to edit the display name)
    if (metadata.fileName) {
      file.fileName = metadata.fileName;
    }

    // Update fileName if provided (this allows users to edit the display name)
    if (
      metadata &&
      typeof metadata === "object" &&
      "fileName" in metadata &&
      metadata.fileName
    ) {
      file.fileName = metadata.fileName;
    }

    // Update the updatedAt timestamp
    file.updatedAt = new Date().toISOString();

    return new Response(JSON.stringify({ success: true, file }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
