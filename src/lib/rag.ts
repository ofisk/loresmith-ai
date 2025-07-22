import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { MODEL_CONFIG, PDF_PROCESSING_CONFIG } from "../constants";
import type { ProcessingProgress, ProcessingStep } from "../types/progress";
import { PDF_PROCESSING_STEPS } from "../types/progress";

export interface PdfChunk {
  id: string;
  file_key: string;
  username: string;
  chunk_text: string;
  chunk_index: number;
  embedding_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PdfMetadata {
  file_key: string;
  username: string;
  file_name: string;
  description?: string;
  tags?: string[];
  file_size: number;
  status: "uploaded" | "processing" | "processed" | "error";
  created_at: string;
}

export interface SearchResult {
  chunk: PdfChunk;
  score: number;
  metadata?: Record<string, any>;
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

export class RAGService {
  constructor(
    private db: D1Database,
    private vectorize: VectorizeIndex,
    private openaiApiKey?: string,
    private progressCallback?: ProgressCallback
  ) {}

  private updateProgress(
    fileKey: string,
    username: string,
    currentStepId: string,
    stepProgress: number,
    overallProgress: number,
    error?: string,
    stepDetails?: string
  ) {
    if (!this.progressCallback) return;

    const steps: ProcessingStep[] = PDF_PROCESSING_STEPS.map((stepDef) => {
      const step: ProcessingStep = {
        ...stepDef,
        status: "pending",
        progress: 0,
        startTime: undefined,
        endTime: undefined,
      };

      if (stepDef.id === currentStepId) {
        step.status = error ? "error" : "processing";
        step.progress = stepProgress;
        step.startTime = step.startTime || Date.now();
        if (error) step.error = error;
        if (stepDetails) step.description = stepDetails;
      } else if (
        this.getStepIndex(stepDef.id) < this.getStepIndex(currentStepId)
      ) {
        step.status = "completed";
        step.progress = 100;
        step.startTime = step.startTime || Date.now();
        step.endTime = step.endTime || Date.now();
      }

      return step;
    });

    const progress: ProcessingProgress = {
      fileKey,
      username,
      overallProgress,
      currentStep:
        PDF_PROCESSING_STEPS.find((s) => s.id === currentStepId)?.name ||
        currentStepId,
      steps,
      startTime: Date.now(),
      status: error ? "error" : "processing",
      error,
    };

    this.progressCallback(progress);
  }

  private getStepIndex(stepId: string): number {
    return PDF_PROCESSING_STEPS.findIndex((s) => s.id === stepId);
  }

  /**
   * Extract text from a PDF buffer using basic parsing
   * Note: This is a simplified approach for Cloudflare Workers compatibility
   */
  async extractTextFromPdf(
    pdfBuffer: ArrayBuffer,
    fileKey?: string,
    username?: string
  ): Promise<string> {
    try {
      // Support large PDFs using configuration
      if (pdfBuffer.byteLength > PDF_PROCESSING_CONFIG.MAX_PDF_SIZE) {
        console.warn(
          `PDF too large (${pdfBuffer.byteLength} bytes), exceeds ${PDF_PROCESSING_CONFIG.MAX_PDF_SIZE / 1024 / 1024}MB limit`
        );
        return `PDF content could not be extracted - file too large for processing (max ${PDF_PROCESSING_CONFIG.MAX_PDF_SIZE / 1024 / 1024}MB)`;
      }

      console.log(
        `Processing PDF of size: ${(pdfBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`
      );

      const uint8Array = new Uint8Array(pdfBuffer);

      // Convert to string for basic text extraction with error handling
      let pdfString: string;
      try {
        const decoder = new TextDecoder("utf-8");
        pdfString = decoder.decode(uint8Array);
      } catch (_decodeError) {
        console.warn(
          "Failed to decode PDF as UTF-8, trying with replacement character"
        );
        const decoder = new TextDecoder("utf-8", { fatal: false });
        pdfString = decoder.decode(uint8Array);
      }

      console.log(`PDF string length: ${pdfString.length} characters`);
      console.log(`First 200 chars: ${pdfString.substring(0, 200)}`);

      // Method 1: Process large PDFs in chunks to prevent memory issues
      const chunkSize = PDF_PROCESSING_CONFIG.CHUNK_SIZE;
      const totalChunks = Math.ceil(pdfString.length / chunkSize);
      let extractedText = "";

      console.log(
        `Processing PDF in ${totalChunks} chunks of ${chunkSize / 1024 / 1024}MB each`
      );

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize, pdfString.length);
        const chunk = pdfString.substring(start, end);

        // Update progress for each chunk
        if (fileKey && username) {
          const chunkProgress = ((i + 1) / totalChunks) * 100;
          this.updateProgress(
            fileKey,
            username,
            "extract",
            chunkProgress,
            20 + chunkProgress * 0.1, // 20-30% overall
            undefined,
            `Processing chunk ${i + 1}/${totalChunks} (${(chunk.length / 1024).toFixed(1)}KB)`
          );
        }

        // Look for text content in this chunk
        const textStreams = chunk.match(/stream[\s\S]*?endstream/g) || [];

        for (const stream of textStreams) {
          // Look for text operators in the stream
          const textMatches = stream.match(/\(([^)]+)\)/g) || [];
          const streamText = textMatches
            .map((match) => match.slice(1, -1)) // Remove parentheses
            .filter((text) => {
              // Filter out numbers, short strings, and common PDF artifacts
              return (
                text.length > 2 &&
                !text.match(/^[0-9\s]+$/) &&
                !text.match(/^[A-Za-z0-9]{1,3}$/) && // Short codes
                !text.includes("\\") && // Escape sequences
                text.trim().length > 0
              );
            })
            .join(" ");

          if (streamText.trim()) {
            extractedText += `${streamText} `;
          }
        }

        // Log progress for large files
        if (totalChunks > 1) {
          console.log(
            `Processed chunk ${i + 1}/${totalChunks} (${(((i + 1) / totalChunks) * 100).toFixed(1)}%)`
          );
        }
      }

      // Method 2: If no text found in streams, try alternative extraction
      if (!extractedText.trim()) {
        console.log("No text found in streams, trying alternative extraction");
        // Look for text in the entire PDF string
        const allTextMatches = pdfString.match(/\(([^)]{3,})\)/g) || [];
        console.log(
          `Found ${allTextMatches.length} text matches in entire PDF`
        );

        extractedText = allTextMatches
          .map((match) => match.slice(1, -1))
          .filter((text) => {
            return (
              text.length > 3 &&
              !text.match(/^[0-9\s]+$/) &&
              !text.match(/^[A-Za-z0-9]{1,4}$/) &&
              !text.includes("\\") &&
              text.trim().length > 0
            );
          })
          .join(" ");
      }

      // Method 3: Try to find any readable text patterns
      if (!extractedText.trim()) {
        console.log("Trying to find any readable text patterns");
        // Look for any sequence of letters and spaces
        const wordPattern = /[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*/g;
        const words = pdfString.match(wordPattern) || [];
        extractedText = words.join(" ");
      }

      // Method 4: Try different encodings
      if (!extractedText.trim()) {
        console.log("Trying different encodings");
        try {
          const latin1Decoder = new TextDecoder("latin1");
          const latin1String = latin1Decoder.decode(uint8Array);
          const latin1Words =
            latin1String.match(/[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*/g) || [];
          extractedText = latin1Words.join(" ");
        } catch (encodingError) {
          console.log("Latin1 encoding failed:", encodingError);
        }
      }

      // If still no text found, return a more specific fallback
      if (!extractedText.trim()) {
        console.log("PDF text extraction failed - no readable text found");
        return "PDF content could not be extracted - please provide description manually";
      }

      console.log(`Extracted ${extractedText.length} characters from PDF`);
      console.log(
        `First 200 chars of extracted text: ${extractedText.substring(0, 200)}`
      );
      return extractedText.trim();
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      return "PDF content could not be extracted - please provide description manually";
    }
  }

  /**
   * Process a PDF file by chunking its content and generating embeddings
   */
  async processPdf(
    fileKey: string,
    username: string,
    content: string,
    _metadata: Partial<PdfMetadata>
  ): Promise<void> {
    try {
      // Update PDF metadata status to processing
      await this.updatePdfStatus(fileKey, "processing");

      // Step 4: Chunk the content
      this.updateProgress(
        fileKey,
        username,
        "chunk",
        25,
        50,
        undefined,
        "Analyzing content structure..."
      );
      const chunks = this.chunkText(content, 1000, 200);
      this.updateProgress(
        fileKey,
        username,
        "chunk",
        100,
        60,
        undefined,
        `Created ${chunks.length} searchable chunks`
      );

      // Step 5: Generate embeddings for each chunk
      this.updateProgress(
        fileKey,
        username,
        "embed",
        25,
        70,
        undefined,
        "Preparing content for vectorization..."
      );
      const embeddings = await this.generateEmbeddings(
        chunks.map((chunk) => chunk.text)
      );
      this.updateProgress(
        fileKey,
        username,
        "embed",
        100,
        80,
        undefined,
        `Generated ${embeddings.length} vector embeddings`
      );

      // Step 6: Store chunks and embeddings
      this.updateProgress(
        fileKey,
        username,
        "store",
        25,
        85,
        undefined,
        "Preparing database storage..."
      );
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Store chunk in D1
        const chunkId = crypto.randomUUID();
        await this.db
          .prepare(
            "INSERT INTO pdf_chunks (id, file_key, username, chunk_text, chunk_index, embedding_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            chunkId,
            fileKey,
            username,
            chunk.text,
            chunk.index,
            chunkId, // Use chunk ID as embedding ID
            JSON.stringify(chunk.metadata || {}),
            new Date().toISOString()
          )
          .run();

        // Store embedding in Vectorize (skip in local development)
        try {
          await this.vectorize.insert([
            {
              id: chunkId,
              values: embedding,
              metadata: {
                file_key: fileKey,
                username: username,
                chunk_index: chunk.index,
                ...chunk.metadata,
              },
            },
          ]);
        } catch (error) {
          console.warn(
            `Skipping Vectorize insert in local development: ${error}`
          );
          // Continue processing even if Vectorize fails
        }

        // Update progress for each chunk with detailed description
        const chunkProgress = 25 + ((i + 1) / chunks.length) * 70; // 25% to 95%
        const overallProgress = 85 + (i / chunks.length) * 10;
        this.updateProgress(
          fileKey,
          username,
          "store",
          chunkProgress,
          overallProgress,
          undefined,
          `Storing chunk ${i + 1}/${chunks.length} (${chunk.text.length} characters)`
        );
      }

      // Update PDF metadata status to processed
      await this.updatePdfStatus(fileKey, "processed");
      this.updateProgress(
        fileKey,
        username,
        "store",
        100,
        100,
        undefined,
        "Processing completed successfully"
      );

      console.log(`Processed PDF ${fileKey} with ${chunks.length} chunks`);
    } catch (error) {
      console.error(`Error processing PDF ${fileKey}:`, error);
      await this.updatePdfStatus(fileKey, "error");
      this.updateProgress(
        fileKey,
        username,
        "store",
        100,
        100,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Generate AI-suggested metadata for a PDF with full content analysis
   */
  async generateMetadataSuggestions(
    content: string,
    fileName: string,
    existingMetadata?: Partial<PdfMetadata>
  ): Promise<{ description: string; tags: string[]; suggestions: string[] }> {
    try {
      console.log(`Starting AI metadata generation for ${fileName}`);
      console.log(`Content length: ${content.length} characters`);

      // Truncate content to prevent context length issues (keep first 8000 chars for analysis)
      const truncatedContent =
        content.length > 8000 ? `${content.substring(0, 8000)}...` : content;
      console.log(
        `Using truncated content length: ${truncatedContent.length} characters`
      );

      // Analyze the content for comprehensive understanding
      const analysisPrompt = this.buildAnalysisPrompt(
        truncatedContent,
        fileName,
        existingMetadata
      );
      console.log(
        `Analysis prompt length: ${analysisPrompt.length} characters`
      );

      console.log(
        `Making OpenAI API call with model: ${MODEL_CONFIG.OPENAI.ANALYSIS}`
      );

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: MODEL_CONFIG.OPENAI.ANALYSIS,
            messages: [
              {
                role: "system",
                content:
                  "You are an expert document analyst. Analyze the PDF content and provide comprehensive metadata suggestions. Consider document type, subject matter, key topics, and potential use cases.",
              },
              {
                role: "user",
                content: analysisPrompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
        }
      );

      console.log(`OpenAI API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error: ${response.status} - ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as any;
      console.log(
        `OpenAI API response received, choices: ${result.choices?.length || 0}`
      );
      const suggestion = result.choices[0].message.content;
      console.log(`AI suggestion received: ${suggestion.substring(0, 200)}...`);

      return this.parseMetadataResponse(suggestion, existingMetadata);
    } catch (error) {
      console.error("Error generating metadata suggestions:", error);
      return {
        description: existingMetadata?.description || "PDF document",
        tags: existingMetadata?.tags || ["document", "pdf"],
        suggestions: [],
      };
    }
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildAnalysisPrompt(
    content: string,
    fileName: string,
    existingMetadata?: Partial<PdfMetadata>
  ): string {
    const hasDescription =
      existingMetadata?.description &&
      existingMetadata.description.trim() !== "";
    const hasTags = existingMetadata?.tags && existingMetadata.tags.length > 0;

    let prompt = `Analyze this PDF document and provide metadata suggestions:\n\n`;
    prompt += `Filename: ${fileName}\n`;
    prompt += `Content Length: ${content.length} characters\n\n`;

    if (hasDescription) {
      prompt += `Current Description: "${existingMetadata.description}"\n`;
    }
    if (hasTags) {
      prompt += `Current Tags: ${existingMetadata.tags?.join(", ")}\n`;
    }

    prompt += `\nFull Content:\n${content}\n\n`;

    prompt += `Please provide:\n`;
    prompt += `1. A concise description (max 200 characters) - ${hasDescription ? "suggest improvements if needed" : "required"}\n`;
    prompt += `2. 3-7 relevant tags - ${hasTags ? "suggest additional tags if needed" : "required"}\n`;
    prompt += `3. Specific suggestions for what the user should add or modify\n\n`;
    prompt += `Format your response as:\n`;
    prompt += `Description: [description]\n`;
    prompt += `Tags: [comma-separated tags]\n`;
    prompt += `Suggestions: [specific suggestions for improvement]`;

    return prompt;
  }

  /**
   * Parse the AI response to extract metadata and suggestions
   */
  private parseMetadataResponse(
    response: string,
    existingMetadata?: Partial<PdfMetadata>
  ): { description: string; tags: string[]; suggestions: string[] } {
    const lines = response.split("\n");
    let description = existingMetadata?.description || "";
    let tags: string[] = existingMetadata?.tags || [];
    let suggestions: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes("description:")) {
        const newDescription = line.split(":")[1]?.trim() || "";
        if (newDescription && newDescription !== description) {
          description = newDescription;
        }
      } else if (lowerLine.includes("tags:")) {
        const tagPart = line.split(":")[1]?.trim() || "";
        const newTags = tagPart
          .split(",")
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0);
        if (newTags.length > 0) {
          tags = newTags;
        }
      } else if (lowerLine.includes("suggestions:")) {
        const suggestionPart = line.split(":")[1]?.trim() || "";
        if (suggestionPart) {
          suggestions = suggestionPart
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        }
      }
    }

    // Generate specific suggestions based on what's missing or could be improved
    if (!description || description === "PDF document") {
      suggestions.push(
        "Add a specific description of the document's content and purpose"
      );
    }
    if (
      tags.length === 0 ||
      tags.includes("document") ||
      tags.includes("pdf")
    ) {
      suggestions.push(
        "Add specific tags related to the document's subject matter"
      );
    }
    if (tags.length < 3) {
      suggestions.push("Add more specific tags to improve searchability");
    }

    return {
      description: description || "PDF document",
      tags: tags.length > 0 ? tags : ["document", "pdf"],
      suggestions,
    };
  }

  /**
   * Process a PDF file from R2 storage
   */
  async processPdfFromR2(
    fileKey: string,
    username: string,
    pdfBucket: R2Bucket,
    metadata: Partial<PdfMetadata>
  ): Promise<{
    suggestedMetadata?: {
      description: string;
      tags: string[];
      suggestions: string[];
    };
  }> {
    try {
      // Add timeout protection to prevent event loop lag (longer for large files)
      const timeoutMs =
        metadata.file_size &&
        metadata.file_size > PDF_PROCESSING_CONFIG.LARGE_FILE_THRESHOLD
          ? PDF_PROCESSING_CONFIG.TIMEOUT_LARGE_FILES
          : PDF_PROCESSING_CONFIG.TIMEOUT_SMALL_FILES;

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(`PDF processing timeout after ${timeoutMs / 1000}s`)
            ),
          timeoutMs
        );
      });

      const processingPromise = this._processPdfFromR2Internal(
        fileKey,
        username,
        pdfBucket,
        metadata
      );

      return (await Promise.race([processingPromise, timeoutPromise])) as any;
    } catch (error) {
      console.error(`Error processing PDF ${fileKey} from R2:`, error);
      await this.updatePdfStatus(fileKey, "error");
      this.updateProgress(
        fileKey,
        username,
        "store",
        100,
        100,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  private async _processPdfFromR2Internal(
    fileKey: string,
    username: string,
    pdfBucket: R2Bucket,
    metadata: Partial<PdfMetadata>
  ): Promise<{
    suggestedMetadata?: {
      description: string;
      tags: string[];
      suggestions: string[];
    };
  }> {
    try {
      // Step 1: Fetch PDF from R2
      this.updateProgress(fileKey, username, "fetch", 25, 5);
      let pdfObject = await pdfBucket.get(fileKey);

      // If not found, try with URL-encoded filename (for local development)
      if (!pdfObject) {
        this.updateProgress(fileKey, username, "fetch", 50, 7);
        const encodedFileKey = encodeURI(fileKey);
        if (encodedFileKey !== fileKey) {
          console.log(`Trying with encoded fileKey: ${encodedFileKey}`);
          pdfObject = await pdfBucket.get(encodedFileKey);
        }
      }

      if (!pdfObject) {
        this.updateProgress(
          fileKey,
          username,
          "fetch",
          100,
          10,
          `PDF file ${fileKey} not found in R2`
        );
        throw new Error(`PDF file ${fileKey} not found in R2`);
      }

      // Convert to ArrayBuffer
      this.updateProgress(fileKey, username, "fetch", 75, 8);
      const pdfBuffer = await pdfObject.arrayBuffer();
      this.updateProgress(fileKey, username, "fetch", 100, 10);

      // Step 2: Extract text from PDF
      this.updateProgress(
        fileKey,
        username,
        "extract",
        25,
        20,
        undefined,
        "Starting text extraction..."
      );
      let extractedText = await this.extractTextFromPdf(
        pdfBuffer,
        fileKey,
        username
      );
      this.updateProgress(
        fileKey,
        username,
        "extract",
        100,
        30,
        undefined,
        "Text extraction completed"
      );

      // Step 3: Generate metadata suggestions
      this.updateProgress(
        fileKey,
        username,
        "metadata",
        25,
        40,
        undefined,
        "Preparing content for AI analysis..."
      );
      const fileName =
        metadata.file_name || fileKey.split("/").pop() || "document.pdf";
      console.log(
        `Generating metadata suggestions for ${fileName} with ${extractedText.length} characters of content`
      );
      console.log(
        `OpenAI API Key available: ${this.openaiApiKey ? "YES" : "NO"}`
      );
      console.log(
        `First 200 chars of extracted text: ${extractedText.substring(0, 200)}`
      );

      if (!this.openaiApiKey) {
        console.error(
          "No OpenAI API key provided - cannot generate metadata suggestions"
        );
        this.updateProgress(
          fileKey,
          username,
          "metadata",
          100,
          45,
          "No OpenAI API key provided"
        );
        return { suggestedMetadata: undefined };
      }

      this.updateProgress(
        fileKey,
        username,
        "metadata",
        50,
        42,
        undefined,
        "Analyzing content with AI..."
      );
      const suggestedMetadata = await this.generateMetadataSuggestions(
        extractedText,
        fileName,
        metadata
      );
      this.updateProgress(
        fileKey,
        username,
        "metadata",
        100,
        45,
        undefined,
        "AI analysis completed"
      );
      console.log(`Generated suggestions:`, suggestedMetadata);

      // Use suggested metadata to fill in missing fields
      if (!metadata.description || metadata.description.trim() === "") {
        metadata.description = suggestedMetadata.description;
      }
      if (!metadata.tags || metadata.tags.length === 0) {
        metadata.tags = suggestedMetadata.tags;
      }

      // Process the extracted text with memory protection
      if (extractedText.length > PDF_PROCESSING_CONFIG.MAX_TEXT_LENGTH) {
        console.warn(
          `Text too large (${extractedText.length} chars), truncating to ${PDF_PROCESSING_CONFIG.MAX_TEXT_LENGTH} chars for processing`
        );
        extractedText =
          extractedText.substring(0, PDF_PROCESSING_CONFIG.MAX_TEXT_LENGTH) +
          "...";
      }

      console.log(
        `Final extracted text length: ${extractedText.length} characters`
      );

      // Step 4-6: Process PDF (chunking, embedding, storing)
      await this.processPdf(fileKey, username, extractedText, metadata);

      console.log(`Successfully processed PDF ${fileKey} from R2`);
      return { suggestedMetadata };
    } catch (error) {
      console.error(`Error processing PDF ${fileKey} from R2:`, error);
      await this.updatePdfStatus(fileKey, "error");
      throw error;
    }
  }

  /**
   * Search for relevant content across all user's PDFs
   */
  async searchContent(
    username: string,
    query: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbeddings([query]);

      // Search in Vectorize
      const searchResults = await this.vectorize.query(queryEmbedding[0], {
        topK: limit,
        returnMetadata: true,
        filter: {
          username: username,
        },
      });

      // Get chunk details from D1
      const chunkIds = searchResults.matches.map((match) => match.id);
      const chunks = await this.getChunksByIds(chunkIds);

      // Combine results
      return searchResults.matches.map((match) => {
        const chunk = chunks.find((c) => c.id === match.id);
        return {
          chunk: chunk!,
          score: match.score,
          metadata: match.metadata,
        };
      });
    } catch (error) {
      console.error("Error searching content:", error);
      throw error;
    }
  }

  /**
   * Get all PDFs for a user
   */
  async getUserPdfs(username: string): Promise<PdfMetadata[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM pdf_metadata WHERE username = ? ORDER BY created_at DESC"
      )
      .bind(username)
      .all();

    return results as unknown as PdfMetadata[];
  }

  /**
   * Get chunks for a specific PDF
   */
  async getPdfChunks(fileKey: string, username: string): Promise<PdfChunk[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM pdf_chunks WHERE file_key = ? AND username = ? ORDER BY chunk_index"
      )
      .bind(fileKey, username)
      .all();

    return results as unknown as PdfChunk[];
  }

  /**
   * Update PDF metadata and optionally regenerate suggestions
   */
  async updatePdfMetadata(
    fileKey: string,
    username: string,
    updates: Partial<Pick<PdfMetadata, "description" | "tags">>,
    regenerateSuggestions: boolean = false
  ): Promise<{ suggestions?: string[] }> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      if (updates.description !== undefined) {
        updateFields.push("description = ?");
        values.push(updates.description);
      }

      if (updates.tags !== undefined) {
        updateFields.push("tags = ?");
        values.push(JSON.stringify(updates.tags));
      }

      if (updateFields.length === 0) {
        return {}; // No updates to make
      }

      updateFields.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(fileKey, username);

      const query = `UPDATE pdf_metadata SET ${updateFields.join(", ")} WHERE file_key = ? AND username = ?`;

      await this.db
        .prepare(query)
        .bind(...values)
        .run();

      console.log(`Updated metadata for PDF ${fileKey}`);

      // Regenerate suggestions if requested
      if (regenerateSuggestions) {
        try {
          // Get the current PDF content to analyze
          const pdfChunks = await this.getPdfChunks(fileKey, username);
          const fullContent = pdfChunks
            .map((chunk) => chunk.chunk_text)
            .join(" ");

          // Get current metadata
          const currentMetadata = await this.getUserPdfs(username);
          const pdfMetadata = currentMetadata.find(
            (pdf) => pdf.file_key === fileKey
          );

          if (pdfMetadata && fullContent) {
            const suggestions = await this.generateMetadataSuggestions(
              fullContent,
              pdfMetadata.file_name,
              { ...pdfMetadata, ...updates }
            );
            return { suggestions: suggestions.suggestions };
          }
        } catch (error) {
          console.error("Error regenerating suggestions:", error);
        }
      }

      return {};
    } catch (error) {
      console.error(`Error updating metadata for PDF ${fileKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete a PDF and all its chunks
   */
  async deletePdf(fileKey: string, username: string): Promise<void> {
    // Get all chunk IDs for this PDF
    const { results } = await this.db
      .prepare("SELECT id FROM pdf_chunks WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .all();

    const chunkIds = results.map((r) => r.id as string);

    // Delete from Vectorize
    if (chunkIds.length > 0) {
      await this.vectorize.deleteByIds(chunkIds);
    }

    // Delete from D1
    await this.db
      .prepare("DELETE FROM pdf_chunks WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .run();

    await this.db
      .prepare("DELETE FROM pdf_metadata WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .run();
  }

  /**
   * Chunk text into smaller pieces for processing
   */
  private chunkText(
    text: string,
    maxChunkSize: number = 1000,
    overlap: number = 200
  ): Array<{ text: string; index: number; metadata?: Record<string, any> }> {
    // Optimize chunking for large texts
    if (text.length > 1000000) {
      // For very large texts
      maxChunkSize = 2000; // Larger chunks
      overlap = 300; // More overlap for context
    }
    const chunks: Array<{
      text: string;
      index: number;
      metadata?: Record<string, any>;
    }> = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      let chunkText = text.slice(start, end);

      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastPeriod = chunkText.lastIndexOf(".");
        const lastExclamation = chunkText.lastIndexOf("!");
        const lastQuestion = chunkText.lastIndexOf("?");
        const lastBreak = Math.max(lastPeriod, lastExclamation, lastQuestion);

        if (lastBreak > maxChunkSize * 0.7) {
          chunkText = chunkText.slice(0, lastBreak + 1);
        }
      }

      chunks.push({
        text: chunkText.trim(),
        index: index++,
        metadata: {
          start_char: start,
          end_char: start + chunkText.length,
        },
      });

      start += chunkText.length - overlap;
    }

    return chunks;
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // For now, we'll use a simple placeholder
    // In production, you'd call OpenAI's embedding API
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    return result.data.map((item: any) => item.embedding);
  }

  /**
   * Update PDF processing status
   */
  private async updatePdfStatus(
    fileKey: string,
    status: PdfMetadata["status"]
  ): Promise<void> {
    await this.db
      .prepare("UPDATE pdf_metadata SET status = ? WHERE file_key = ?")
      .bind(status, fileKey)
      .run();
  }

  /**
   * Get chunks by their IDs
   */
  private async getChunksByIds(ids: string[]): Promise<PdfChunk[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(`SELECT * FROM pdf_chunks WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all();

    return results as unknown as PdfChunk[];
  }
}
