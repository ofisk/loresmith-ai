export interface SplitResult {
  shards: Array<{
    key: string;
    content: ArrayBuffer;
    contentType: string;
    size: number;
  }>;
  manifest: {
    originalFile: string;
    shardCount: number;
    totalSize: number;
    probeToken: string;
    shards: Array<{
      key: string;
      size: number;
      contentType: string;
    }>;
  };
}

export interface SplitOptions {
  maxShardSize: number;
  contentType: string;
  originalFilename: string;
  tenant: string;
}

export class FileSplitter {
  /**
   * Split a file into valid shards based on its type
   */
  async splitFile(
    content: ArrayBuffer,
    options: SplitOptions
  ): Promise<SplitResult> {
    const { maxShardSize, contentType, originalFilename, tenant } = options;

    // If file is already under the limit, return as single shard
    if (content.byteLength <= maxShardSize) {
      const shardKey = this.generateShardKey(tenant, originalFilename, 1);
      const probeToken = this.generateProbeToken();

      return {
        shards: [
          {
            key: shardKey,
            content,
            contentType,
            size: content.byteLength,
          },
        ],
        manifest: {
          originalFile: originalFilename,
          shardCount: 1,
          totalSize: content.byteLength,
          probeToken,
          shards: [
            {
              key: shardKey,
              size: content.byteLength,
              contentType,
            },
          ],
        },
      };
    }

    // Split based on content type
    if (contentType === "application/pdf") {
      return this.splitPDF(content, options);
    } else if (
      contentType.startsWith("text/") ||
      contentType === "application/markdown" ||
      contentType === "text/markdown"
    ) {
      return this.splitText(content, options);
    } else if (
      contentType === "text/html" ||
      contentType === "application/xhtml+xml"
    ) {
      return this.splitHTML(content, options);
    } else {
      // For unknown types, split by bytes
      console.warn(
        `[FileSplitter] Unknown content type: ${contentType}, splitting by bytes`
      );
      return this.splitByBytes(content, options);
    }
  }

  /**
   * Split PDF by pages using pdf-lib
   */
  private async splitPDF(
    content: ArrayBuffer,
    options: SplitOptions
  ): Promise<SplitResult> {
    const { maxShardSize, contentType, originalFilename, tenant } = options;

    try {
      // Import pdf-lib dynamically to avoid issues in Cloudflare Workers
      const { PDFDocument } = await import("pdf-lib");

      // Load the PDF document
      const pdfDoc = await PDFDocument.load(content);
      const pageCount = pdfDoc.getPageCount();

      console.log(
        `[FileSplitter] PDF has ${pageCount} pages, splitting by pages`
      );

      const shards: Array<{
        key: string;
        content: ArrayBuffer;
        contentType: string;
        size: number;
      }> = [];
      const manifestShards: Array<{
        key: string;
        size: number;
        contentType: string;
      }> = [];

      // Calculate how many pages per shard to stay under maxShardSize
      // We'll estimate page size and adjust accordingly
      const estimatedPageSize = content.byteLength / pageCount;
      const pagesPerShard = Math.max(
        1,
        Math.floor(maxShardSize / estimatedPageSize)
      );

      console.log(
        `[FileSplitter] Estimated ${pagesPerShard} pages per shard (max ${maxShardSize} bytes)`
      );

      let currentPage = 0;
      let shardNumber = 1;

      while (currentPage < pageCount) {
        // Create a new PDF document for this shard
        const shardDoc = await PDFDocument.create();

        // Calculate how many pages to include in this shard
        const pagesInThisShard = Math.min(
          pagesPerShard,
          pageCount - currentPage
        );
        const endPage = currentPage + pagesInThisShard;

        // Copy pages from original to shard
        const pageIndices = Array.from(
          { length: pagesInThisShard },
          (_, i) => currentPage + i
        );

        const copiedPages = await shardDoc.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach((page: any) => {
          shardDoc.addPage(page);
        });

        // Save the shard as PDF
        const shardBytes = await shardDoc.save();
        const shardBuffer = shardBytes.buffer.slice(
          shardBytes.byteOffset,
          shardBytes.byteOffset + shardBytes.byteLength
        ) as ArrayBuffer;

        // Check if shard is too large and split further if needed
        if (shardBuffer.byteLength > maxShardSize && pagesInThisShard > 1) {
          console.log(
            `[FileSplitter] Shard ${shardNumber} too large (${shardBuffer.byteLength} bytes), splitting further`
          );

          // Split this shard into individual pages
          for (let i = 0; i < pagesInThisShard; i++) {
            const pageDoc = await PDFDocument.create();
            const pageIndex = currentPage + i;
            const [copiedPage] = await pageDoc.copyPages(pdfDoc, [pageIndex]);
            pageDoc.addPage(copiedPage);

            const pageBytes = await pageDoc.save();
            const pageBuffer = pageBytes.buffer.slice(
              pageBytes.byteOffset,
              pageBytes.byteOffset + pageBytes.byteLength
            ) as ArrayBuffer;

            const pageShardKey = this.generateShardKey(
              tenant,
              originalFilename,
              shardNumber
            );

            shards.push({
              key: pageShardKey,
              content: pageBuffer,
              contentType,
              size: pageBuffer.byteLength,
            });

            manifestShards.push({
              key: pageShardKey,
              size: pageBuffer.byteLength,
              contentType,
            });

            shardNumber++;
          }
        } else {
          // Shard is within size limit, use as is
          const shardKey = this.generateShardKey(
            tenant,
            originalFilename,
            shardNumber
          );

          shards.push({
            key: shardKey,
            content: shardBuffer,
            contentType,
            size: shardBuffer.byteLength,
          });

          manifestShards.push({
            key: shardKey,
            size: shardBuffer.byteLength,
            contentType,
          });

          shardNumber++;
        }

        currentPage = endPage;
      }

      const probeToken = this.generateProbeToken();

      console.log(`[FileSplitter] Split PDF into ${shards.length} shards`);

      return {
        shards,
        manifest: {
          originalFile: originalFilename,
          shardCount: shards.length,
          totalSize: content.byteLength,
          probeToken,
          shards: manifestShards,
        },
      };
    } catch (error) {
      console.error("[FileSplitter] Error splitting PDF:", error);

      // Fallback to byte-based splitting if PDF processing fails
      console.warn(
        "[FileSplitter] Falling back to byte-based splitting for PDF"
      );
      return this.splitByBytes(content, options);
    }
  }

  /**
   * Split text content by character count, trying to break at word boundaries
   */
  private async splitText(
    content: ArrayBuffer,
    options: SplitOptions
  ): Promise<SplitResult> {
    const { maxShardSize, contentType, originalFilename, tenant } = options;
    const text = new TextDecoder().decode(content);
    const shards: Array<{
      key: string;
      content: ArrayBuffer;
      contentType: string;
      size: number;
    }> = [];
    const manifestShards: Array<{
      key: string;
      size: number;
      contentType: string;
    }> = [];

    let currentPos = 0;
    let shardNumber = 1;

    while (currentPos < text.length) {
      const remainingText = text.slice(currentPos);
      let chunkSize = Math.min(maxShardSize, remainingText.length);

      // Try to break at word boundary
      if (chunkSize < remainingText.length) {
        const lastSpace = remainingText.lastIndexOf(" ", chunkSize);
        if (lastSpace > chunkSize * 0.8) {
          // Only break at space if it's not too far back
          chunkSize = lastSpace;
        }
      }

      const chunk = remainingText.slice(0, chunkSize);
      const chunkBuffer = new TextEncoder().encode(chunk);
      const shardKey = this.generateShardKey(
        tenant,
        originalFilename,
        shardNumber
      );

      shards.push({
        key: shardKey,
        content: chunkBuffer.buffer.slice(
          chunkBuffer.byteOffset,
          chunkBuffer.byteOffset + chunkBuffer.byteLength
        ),
        contentType,
        size: chunkBuffer.byteLength,
      });

      manifestShards.push({
        key: shardKey,
        size: chunkBuffer.byteLength,
        contentType,
      });

      currentPos += chunkSize;
      shardNumber++;
    }

    const probeToken = this.generateProbeToken();

    return {
      shards,
      manifest: {
        originalFile: originalFilename,
        shardCount: shards.length,
        totalSize: content.byteLength,
        probeToken,
        shards: manifestShards,
      },
    };
  }

  /**
   * Split HTML content by sections
   */
  private async splitHTML(
    content: ArrayBuffer,
    options: SplitOptions
  ): Promise<SplitResult> {
    const { maxShardSize, contentType, originalFilename, tenant } = options;
    const html = new TextDecoder().decode(content);
    const shards: Array<{
      key: string;
      content: ArrayBuffer;
      contentType: string;
      size: number;
    }> = [];
    const manifestShards: Array<{
      key: string;
      size: number;
      contentType: string;
    }> = [];

    // Simple HTML splitting by sections (h1, h2, h3 tags)
    const sections = this.splitHTMLIntoSections(html, maxShardSize);

    sections.forEach((section, index) => {
      const sectionBuffer = new TextEncoder().encode(section);
      const shardKey = this.generateShardKey(
        tenant,
        originalFilename,
        index + 1
      );

      shards.push({
        key: shardKey,
        content: sectionBuffer.buffer.slice(
          sectionBuffer.byteOffset,
          sectionBuffer.byteOffset + sectionBuffer.byteLength
        ),
        contentType,
        size: sectionBuffer.byteLength,
      });

      manifestShards.push({
        key: shardKey,
        size: sectionBuffer.byteLength,
        contentType,
      });
    });

    const probeToken = this.generateProbeToken();

    return {
      shards,
      manifest: {
        originalFile: originalFilename,
        shardCount: shards.length,
        totalSize: content.byteLength,
        probeToken,
        shards: manifestShards,
      },
    };
  }

  /**
   * Split HTML into sections based on headers
   */
  private splitHTMLIntoSections(html: string, maxSize: number): string[] {
    const sections: string[] = [];
    const headerRegex = /<(h[1-6])[^>]*>/gi;
    const matches = Array.from(html.matchAll(headerRegex));

    if (matches.length === 0) {
      // No headers found, split by size
      return this.splitTextBySize(html, maxSize);
    }

    let currentSection = "";
    let currentSize = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];

      const sectionStart = match.index!;
      const sectionEnd = nextMatch ? nextMatch.index! : html.length;
      const sectionContent = html.slice(sectionStart, sectionEnd);

      if (currentSize + sectionContent.length > maxSize && currentSection) {
        sections.push(currentSection);
        currentSection = sectionContent;
        currentSize = sectionContent.length;
      } else {
        currentSection += sectionContent;
        currentSize += sectionContent.length;
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Split text by size (fallback method)
   */
  private splitTextBySize(text: string, maxSize: number): string[] {
    const sections: string[] = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      const chunk = text.slice(currentPos, currentPos + maxSize);
      sections.push(chunk);
      currentPos += maxSize;
    }

    return sections;
  }

  /**
   * Split by bytes
   */
  private async splitByBytes(
    content: ArrayBuffer,
    options: SplitOptions
  ): Promise<SplitResult> {
    const { maxShardSize, contentType, originalFilename, tenant } = options;
    const shards: Array<{
      key: string;
      content: ArrayBuffer;
      contentType: string;
      size: number;
    }> = [];
    const manifestShards: Array<{
      key: string;
      size: number;
      contentType: string;
    }> = [];

    let offset = 0;
    let shardNumber = 1;

    while (offset < content.byteLength) {
      const chunkSize = Math.min(maxShardSize, content.byteLength - offset);
      const chunk = content.slice(offset, offset + chunkSize);
      const shardKey = this.generateShardKey(
        tenant,
        originalFilename,
        shardNumber
      );

      shards.push({
        key: shardKey,
        content: chunk,
        contentType,
        size: chunk.byteLength,
      });

      manifestShards.push({
        key: shardKey,
        size: chunk.byteLength,
        contentType,
      });

      offset += chunkSize;
      shardNumber++;
    }

    const probeToken = this.generateProbeToken();

    return {
      shards,
      manifest: {
        originalFile: originalFilename,
        shardCount: shards.length,
        totalSize: content.byteLength,
        probeToken,
        shards: manifestShards,
      },
    };
  }

  /**
   * Generate a shard key with predictable naming
   */
  private generateShardKey(
    tenant: string,
    originalFilename: string,
    shardNumber: number
  ): string {
    const lastDotIndex = originalFilename.lastIndexOf(".");
    const nameWithoutExt =
      lastDotIndex !== -1
        ? originalFilename.substring(0, lastDotIndex)
        : originalFilename;
    const extension =
      lastDotIndex !== -1 ? originalFilename.substring(lastDotIndex) : "";

    return `library/${tenant}/${nameWithoutExt}.p${shardNumber.toString().padStart(3, "0")}${extension}`;
  }

  /**
   * Generate a probe token for status checking
   */
  private generateProbeToken(): string {
    return `probe_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
