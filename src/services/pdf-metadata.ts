/**
 * PDF Metadata Service
 * 
 * Handles storage and retrieval of PDF metadata using Cloudflare KV.
 * This service provides a clean interface for managing PDF information
 * separate from the actual file storage in R2.
 */

//TODO: Proactively adding fields to these interfaces - ideally AI would fill the majority of these fields, several can probably be removed later
export interface PdfMetadata {
  contentType: string;
  fileSize: number;
  filename: string;
  id: string;
  key: string; //R2 object key
  status: "uploading" | "completed" | "error";
  uploadedAt: string;
  // Optional properties
  author?: string;
  customFields?: Record<string, string>;
  description?: string;
  errorMessage?: string;
  keywords?: string[];
  pageCount?: number;
  subject?: string;
  tags?: string[];
  title?: string;
  uploadedBy?: string;
}

export interface CreatePdfMetadataParams {
  fileSize: number;
  filename: string;
  id: string;
  key: string; //R2 object key
  // Optional properties
  contentType?: string;
  customFields?: Record<string, string>;
  description?: string;
  tags?: string[];
  uploadedBy?: string;
}

export interface UpdatePdfMetadataParams {
  // Optional properties
  author?: string;
  customFields?: Record<string, string>;
  description?: string;
  keywords?: string[];
  subject?: string;
  tags?: string[];
  title?: string;
}

export interface ListPdfMetadataParams {
  // Optional properties
  cursor?: string;
  limit?: number;
  status?: PdfMetadata["status"];
  tags?: string[];
  uploadedBy?: string;
}

export interface ListPdfMetadataResult {
  hasMore: boolean;
  items: PdfMetadata[];
  // Optional properties
  cursor?: string;
}

/**
 * PDF Metadata Service Class
 */
export class PdfMetadataService {
  constructor(private kv: KVNamespace) {}

  /**
   * Create new PDF metadata
   */
  async createMetadata(params: CreatePdfMetadataParams): Promise<PdfMetadata> {
    const metadata: PdfMetadata = {
      id: params.id,
      key: params.key,
      filename: params.filename,
      fileSize: params.fileSize,
      description: params.description,
      tags: params.tags || [],
      uploadedAt: new Date().toISOString(),
      uploadedBy: params.uploadedBy,
      contentType: params.contentType || "application/pdf",
      status: "uploading",
      customFields: params.customFields || {},
    };

    // Store in KV with the ID as the key
    await this.kv.put(`pdf:${params.id}`, JSON.stringify(metadata), {
      metadata: {
        filename: params.filename,
        uploadedAt: metadata.uploadedAt,
        status: metadata.status,
      },
    });

    // Also store with filename as key for quick lookups
    await this.kv.put(`pdf:filename:${params.filename}`, params.id);

    // Store in tags index for filtering
    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        await this.kv.put(`pdf:tag:${tag}:${params.id}`, "1");
      }
    }

    return metadata;
  }

  /**
   * Get PDF metadata by ID
   */
  async getMetadata(id: string): Promise<PdfMetadata | null> {
    const data = await this.kv.get(`pdf:${id}`);
    if (!data) return null;
    
    return JSON.parse(data) as PdfMetadata;
  }

  /**
   * Get PDF metadata by filename
   */
  async getMetadataByFilename(filename: string): Promise<PdfMetadata | null> {
    const id = await this.kv.get(`pdf:filename:${filename}`);
    if (!id) return null;
    
    return this.getMetadata(id);
  }

  /**
   * Update PDF metadata
   */
  async updateMetadata(id: string, updates: UpdatePdfMetadataParams): Promise<PdfMetadata | null> {
    const existing = await this.getMetadata(id);
    if (!existing) return null;

    // Update fields
    const updated: PdfMetadata = {
      ...existing,
      ...updates,
      // Merge tags arrays
      tags: updates.tags ? [...new Set([...(existing.tags || []), ...updates.tags])] : existing.tags,
      // Merge custom fields
      customFields: {
        ...existing.customFields,
        ...updates.customFields,
      },
    };

    // Update in KV
    await this.kv.put(`pdf:${id}`, JSON.stringify(updated), {
      metadata: {
        filename: updated.filename,
        uploadedAt: updated.uploadedAt,
        status: updated.status,
      },
    });

    // Update tags index if tags changed
    if (updates.tags) {
      // Remove old tags
      for (const tag of existing.tags || []) {
        await this.kv.delete(`pdf:tag:${tag}:${id}`);
      }
      // Add new tags
      for (const tag of updated.tags || []) {
        await this.kv.put(`pdf:tag:${tag}:${id}`, "1");
      }
    }

    return updated;
  }

  /**
   * Update upload status
   */
  async updateStatus(id: string, status: PdfMetadata["status"], errorMessage?: string): Promise<void> {
    const existing = await this.getMetadata(id);
    if (!existing) return;

    const updated: PdfMetadata = {
      ...existing,
      status,
      errorMessage,
    };

    await this.kv.put(`pdf:${id}`, JSON.stringify(updated), {
      metadata: {
        filename: updated.filename,
        uploadedAt: updated.uploadedAt,
        status: updated.status,
      },
    });
  }

  /**
   * List PDF metadata with filtering and pagination
   */
  async listMetadata(params: ListPdfMetadataParams = {}): Promise<ListPdfMetadataResult> {
    const { limit = 50, cursor, tags, uploadedBy, status } = params;
    
    // Build list options
    const listOptions: KVNamespaceListOptions = {
      limit,
      cursor,
      prefix: "pdf:",
    };

    // Filter by status if specified
    if (status) {
      listOptions.prefix = `pdf:status:${status}:`;
    }

    const result = await this.kv.list(listOptions);
    const items: PdfMetadata[] = [];

    // Fetch metadata for each key
    for (const key of result.keys) {
      // Skip index keys
      if (key.name.startsWith("pdf:filename:") || key.name.startsWith("pdf:tag:")) {
        continue;
      }

      const data = await this.kv.get(key.name);
      if (data) {
        const metadata = JSON.parse(data) as PdfMetadata;
        
        // Apply filters
        if (uploadedBy && metadata.uploadedBy !== uploadedBy) continue;
        if (tags && tags.length > 0) {
          const hasMatchingTag = tags.some(tag => metadata.tags?.includes(tag));
          if (!hasMatchingTag) continue;
        }
        
        items.push(metadata);
      }
    }

    return {
      items,
      cursor: "cursor" in result ? result.cursor : undefined,
      hasMore: result.list_complete === false,
    };
  }

  /**
   * Delete PDF metadata
   */
  async deleteMetadata(id: string): Promise<boolean> {
    const existing = await this.getMetadata(id);
    if (!existing) return false;

    // Delete main metadata
    await this.kv.delete(`pdf:${id}`);
    
    // Delete filename index
    await this.kv.delete(`pdf:filename:${existing.filename}`);
    
    // Delete tag indexes
    if (existing.tags) {
      for (const tag of existing.tags) {
        await this.kv.delete(`pdf:tag:${tag}:${id}`);
      }
    }

    return true;
  }

  /**
   * Search PDFs by text (searches filename, description, tags)
   */
  async searchPdfs(query: string, limit = 20): Promise<PdfMetadata[]> {
    // Simple search implementation
    // In a production app, you might want to use a proper search service
    const allPdfs = await this.listMetadata({ limit: 1000 });
    
    const searchTerm = query.toLowerCase();
    const results = allPdfs.items.filter(pdf => 
      pdf.filename.toLowerCase().includes(searchTerm) ||
      pdf.description?.toLowerCase().includes(searchTerm) ||
      pdf.tags?.some(tag => tag.toLowerCase().includes(searchTerm)) ||
      pdf.title?.toLowerCase().includes(searchTerm) ||
      pdf.author?.toLowerCase().includes(searchTerm) ||
      pdf.subject?.toLowerCase().includes(searchTerm)
    );

    return results.slice(0, limit);
  }

  /**
   * Get PDFs by tag
   */
  async getPdfsByTag(tag: string, limit = 50): Promise<PdfMetadata[]> {
    const result = await this.kv.list({
      prefix: `pdf:tag:${tag}:`,
      limit: 1000,
    });

    const pdfIds = result.keys.map(key => key.name.split(":").pop()!);
    const pdfs: PdfMetadata[] = [];

    for (const id of pdfIds.slice(0, limit)) {
      const metadata = await this.getMetadata(id);
      if (metadata) {
        pdfs.push(metadata);
      }
    }

    return pdfs;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalPdfs: number;
    totalSize: number;
    averageSize: number;
    tags: Record<string, number>;
  }> {
    const allPdfs = await this.listMetadata({ limit: 1000 });
    
    const totalPdfs = allPdfs.items.length;
    const totalSize = allPdfs.items.reduce((sum, pdf) => sum + pdf.fileSize, 0);
    const averageSize = totalPdfs > 0 ? totalSize / totalPdfs : 0;
    
    // Count tags
    const tagCounts: Record<string, number> = {};
    for (const pdf of allPdfs.items) {
      for (const tag of pdf.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return {
      totalPdfs,
      totalSize,
      averageSize,
      tags: tagCounts,
    };
  }
} 