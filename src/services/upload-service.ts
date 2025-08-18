// Upload service for handling multipart uploads to R2
// This service manages the R2 operations and coordinates with the Durable Object

import type { Env } from "../middleware/auth";
import type { FileMetadata, UploadPart, UploadSession } from "../types/upload";
import { ServiceFactory } from "./service-factory";
import { getDAOFactory } from "../dao/dao-factory";
import { FILE_PROCESSING_CONFIG } from "../constants";

export class UploadService {
  constructor(private env: Env) {}

  /**
   * Start a multipart upload session with AutoRAG chunking
   */
  async startUpload(
    userId: string,
    filename: string,
    fileSize: number,
    contentType: string = "application/octet-stream"
  ): Promise<{
    sessionId: string;
    uploadId: string;
    fileKey: string;
    totalParts: number;
    autoRAGChunking: boolean;
  }> {
    const timestamp = Date.now();
    const fileKey = `${userId}/${timestamp}-${filename}`;

    const multipartUpload = await this.env.FILE_BUCKET.createMultipartUpload(
      fileKey,
      {
        httpMetadata: { contentType },
      }
    );

    const chunkSize = FILE_PROCESSING_CONFIG.CHUNK_SIZE;
    const totalParts = Math.ceil(fileSize / chunkSize);

    const sessionId = `${userId}-${timestamp}`;
    const sessionStub = this.env.UploadSession.idFromName(sessionId);
    const sessionObj = this.env.UploadSession.get(sessionStub);

    const sessionData = {
      userId,
      fileKey,
      uploadId: multipartUpload.uploadId,
      filename,
      fileSize,
      totalParts,
      autoRAGChunking: true, // Always enabled
    };

    const response = await sessionObj.fetch("https://dummy.com?action=create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData),
    });

    if (!response.ok) {
      throw new Error("Failed to create upload session");
    }

    console.log(`[UploadService] Started upload:`, {
      sessionId,
      fileKey,
      uploadId: multipartUpload.uploadId,
      totalParts,
      autoRAGChunking: true,
    });

    return {
      sessionId,
      uploadId: multipartUpload.uploadId,
      fileKey,
      totalParts,
      autoRAGChunking: true,
    };
  }

  /**
   * Upload a part of the multipart upload with direct AutoRAG processing
   */
  async uploadPart(
    sessionId: string,
    partNumber: number,
    chunk: ArrayBuffer
  ): Promise<{ etag: string; size: number; autoRAGChunks?: string[] }> {
    const sessionStub = this.env.UploadSession.idFromName(sessionId);
    const sessionObj = this.env.UploadSession.get(sessionStub);

    const sessionResponse = await sessionObj.fetch(
      "https://dummy.com?action=get"
    );
    if (!sessionResponse.ok) {
      throw new Error("Upload session not found");
    }

    const session = (await sessionResponse.json()) as UploadSession;

    // Resume multipart upload and upload part
    const multipartUpload = this.env.FILE_BUCKET.resumeMultipartUpload(
      session.fileKey,
      session.uploadId
    );

    const uploadedPart = await multipartUpload.uploadPart(partNumber, chunk);

    // Always create a part file for AutoRAG
    let autoRAGChunks: string[] = [];
    autoRAGChunks = await this.createAutoRAGPartFromUpload(
      chunk,
      session.fileKey,
      partNumber,
      session.userId
    );

    // Record part in Durable Object
    const partData = {
      partNumber,
      etag: uploadedPart.etag,
      size: chunk.byteLength,
      autoRAGChunks,
    };

    await sessionObj.fetch("https://dummy.com?action=addPart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partData),
    });

    console.log(`[UploadService] Uploaded part ${partNumber}:`, {
      sessionId,
      etag: uploadedPart.etag,
      size: chunk.byteLength,
      autoRAGChunks: autoRAGChunks.length,
    });

    return {
      etag: uploadedPart.etag,
      size: chunk.byteLength,
      autoRAGChunks,
    };
  }

  /**
   * Complete the multipart upload
   */
  async completeUpload(
    sessionId: string
  ): Promise<{ fileKey: string; metadata: FileMetadata }> {
    // Get session and parts from Durable Object
    const sessionStub = this.env.UploadSession.idFromName(sessionId);
    const sessionObj = this.env.UploadSession.get(sessionStub);

    const completeResponse = await sessionObj.fetch(
      "https://dummy.com?action=complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }
    );

    if (!completeResponse.ok) {
      throw new Error("Failed to complete upload");
    }

    const responseData = (await completeResponse.json()) as {
      session: UploadSession;
      parts: UploadPart[];
    };
    const { session } = responseData;

    // Always skip completing the original file since we always create AutoRAG parts
    console.log(
      `[UploadService] Skipping original file completion for ${session.fileKey} - AutoRAG parts were created`
    );

    // Abort the multipart upload to clean up
    const multipartUpload = this.env.FILE_BUCKET.resumeMultipartUpload(
      session.fileKey,
      session.uploadId
    );
    await multipartUpload.abort();

    // Create file metadata
    const metadata: FileMetadata = {
      id: crypto.randomUUID(),
      fileKey: session.fileKey,
      userId: session.userId,
      filename: session.filename,
      fileSize: session.fileSize,
      contentType: "application/octet-stream", // Will be updated based on file type
      tags: [],
      status: "uploaded",
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Store metadata in D1 using DAO
    const fileDAO = getDAOFactory(this.env).fileDAO;
    await fileDAO.createFileRecord(
      metadata.id,
      metadata.fileKey,
      metadata.filename,
      metadata.description || "",
      JSON.stringify(metadata.tags),
      metadata.userId,
      metadata.status,
      metadata.fileSize
    );

    console.log(`[UploadService] Completed upload:`, {
      sessionId,
      fileKey: session.fileKey,
      metadataId: metadata.id,
    });

    return { fileKey: session.fileKey, metadata };
  }

  /**
   * Get upload progress
   */
  async getProgress(sessionId: string): Promise<{
    uploadedParts: number;
    totalParts: number;
    percentage: number;
    status: string;
  }> {
    const sessionStub = this.env.UploadSession.idFromName(sessionId);
    const sessionObj = this.env.UploadSession.get(sessionStub);

    const response = await sessionObj.fetch("https://dummy.com?action=get");
    if (!response.ok) {
      throw new Error("Upload session not found");
    }

    const session = (await response.json()) as UploadSession;
    const percentage = Math.round(
      (session.uploadedParts / session.totalParts) * 100
    );

    return {
      uploadedParts: session.uploadedParts,
      totalParts: session.totalParts,
      percentage,
      status: session.status,
    };
  }

  /**
   * Clean up upload session
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const sessionStub = this.env.UploadSession.idFromName(sessionId);
    const sessionObj = this.env.UploadSession.get(sessionStub);

    await sessionObj.fetch("https://dummy.com?action=delete", {
      method: "DELETE",
    });

    console.log(`[UploadService] Cleaned up session:`, { sessionId });
  }

  /**
   * Create AutoRAG part file from uploaded part
   * Each multipart chunk is already AutoRAG-optimized (1MB)
   * Store chunk metadata in database instead of R2
   */
  private async createAutoRAGPartFromUpload(
    chunk: ArrayBuffer,
    fileKey: string,
    partNumber: number,
    userId: string
  ): Promise<string[]> {
    try {
      const originalFilename = fileKey.split("/").pop() || "unknown";
      const partKey = `${userId}/part-${partNumber}-${originalFilename}.chunk`;

      await this.env.FILE_BUCKET.put(partKey, chunk, {
        httpMetadata: {
          contentType: "application/octet-stream",
        },
      });

      const chunksDAO = ServiceFactory.getAutoRAGChunksDAO(this.env);
      const chunkId = `${fileKey}-part-${partNumber}`;
      await chunksDAO.insertChunk({
        id: chunkId,
        fileKey,
        username: userId,
        chunkKey: partKey,
        partNumber,
        chunkSize: chunk.byteLength,
        originalFilename,
      });

      console.log(
        `[UploadService] Created AutoRAG chunk for part ${partNumber} of ${fileKey}:`,
        {
          partKey,
          chunkSize: chunk.byteLength,
          chunkId,
        }
      );

      return [partKey];
    } catch (error) {
      console.error(
        `[UploadService] Error creating AutoRAG chunk for part ${partNumber}:`,
        error
      );
      return [];
    }
  }
}
