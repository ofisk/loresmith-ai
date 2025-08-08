// Durable Object for managing upload sessions
// This provides persistent state for multipart uploads across Worker instances

interface UploadSession {
  id: string;
  userId: string;
  fileKey: string;
  uploadId: string;
  filename: string;
  fileSize: number;
  totalParts: number;
  uploadedParts: number;
  status: "pending" | "uploading" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  autoRAGChunking?: boolean;
}

interface UploadPart {
  partNumber: number;
  etag: string;
  size: number;
  autoRAGChunks?: string[];
}

export class UploadSessionDO {
  private state: DurableObjectState;
  private session: UploadSession | null = null;

  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    try {
      switch (action) {
        case "create":
          return await this.createSession(request);
        case "get":
          return await this.getSession();
        case "update":
          return await this.updateSession(request);
        case "addPart":
          return await this.addPart(request);
        case "complete":
          return await this.completeUpload(request);
        case "delete":
          return await this.deleteSession();
        default:
          return new Response("Invalid action", { status: 400 });
      }
    } catch (error) {
      console.error(`[UploadSessionDO] Error in action ${action}:`, error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async createSession(request: Request): Promise<Response> {
    const data = (await request.json()) as Partial<UploadSession>;

    if (
      !data.userId ||
      !data.fileKey ||
      !data.uploadId ||
      !data.filename ||
      !data.fileSize
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date().toISOString();
    this.session = {
      id: this.state.id.toString(),
      userId: data.userId,
      fileKey: data.fileKey,
      uploadId: data.uploadId,
      filename: data.filename,
      fileSize: data.fileSize,
      totalParts: data.totalParts || 1,
      uploadedParts: 0,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      autoRAGChunking: data.autoRAGChunking || false,
    };

    await this.state.storage.put("session", this.session);

    console.log(`[UploadSessionDO] Created session:`, {
      sessionId: this.session.id,
      fileKey: this.session.fileKey,
      uploadId: this.session.uploadId,
    });

    return new Response(
      JSON.stringify({ success: true, session: this.session }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async getSession(): Promise<Response> {
    if (!this.session) {
      this.session = (await this.state.storage.get(
        "session"
      )) as UploadSession | null;
    }

    if (!this.session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(this.session), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private async updateSession(request: Request): Promise<Response> {
    const updates = (await request.json()) as Partial<UploadSession>;

    if (!this.session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    this.session = {
      ...this.session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.state.storage.put("session", this.session);

    return new Response(
      JSON.stringify({ success: true, session: this.session }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async addPart(request: Request): Promise<Response> {
    const { partNumber, etag, size, autoRAGChunks } =
      (await request.json()) as UploadPart;

    if (!this.session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Store the part information
    const parts =
      ((await this.state.storage.get("parts")) as UploadPart[]) || [];
    parts.push({ partNumber, etag, size, autoRAGChunks });
    await this.state.storage.put("parts", parts);

    // Update session progress
    this.session.uploadedParts = parts.length;
    this.session.status =
      this.session.uploadedParts >= this.session.totalParts
        ? "completed"
        : "uploading";
    this.session.updatedAt = new Date().toISOString();
    await this.state.storage.put("session", this.session);

    console.log(`[UploadSessionDO] Added part ${partNumber}:`, {
      sessionId: this.session.id,
      uploadedParts: this.session.uploadedParts,
      totalParts: this.session.totalParts,
    });

    return new Response(
      JSON.stringify({
        success: true,
        session: this.session,
        parts: parts,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async completeUpload(_request: Request): Promise<Response> {
    if (!this.session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parts =
      ((await this.state.storage.get("parts")) as UploadPart[]) || [];

    if (parts.length !== this.session.totalParts) {
      return new Response(
        JSON.stringify({
          error: `Expected ${this.session.totalParts} parts, got ${parts.length}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update session to completed
    this.session.status = "completed";
    this.session.updatedAt = new Date().toISOString();
    await this.state.storage.put("session", this.session);

    console.log(`[UploadSessionDO] Completed upload:`, {
      sessionId: this.session.id,
      fileKey: this.session.fileKey,
      partsCount: parts.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        session: this.session,
        parts: parts,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async deleteSession(): Promise<Response> {
    await this.state.storage.delete("session");
    await this.state.storage.delete("parts");
    this.session = null;

    console.log(`[UploadSessionDO] Deleted session:`, {
      sessionId: this.state.id.toString(),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
