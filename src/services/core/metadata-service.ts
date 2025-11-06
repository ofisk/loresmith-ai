import type { Env } from "@/middleware/auth";

export interface Metadata {
  description: string;
  tags: string[];
  suggestions?: string[];
}

export interface MetadataGenerationOptions {
  includeContent?: boolean;
  includeFilename?: boolean;
  maxTags?: number;
}

export class MetadataService {
  constructor(private env: Env) {}

  /**
   * Generate semantic metadata for a file using AI
   */
  async generateSemanticMetadata(
    fileName: string,
    fileKey: string,
    username: string,
    content?: string,
    options: MetadataGenerationOptions = {}
  ): Promise<Metadata | undefined> {
    const {
      includeContent = false,
      includeFilename = true,
      maxTags = 5,
    } = options;

    try {
      if (!this.env.AI) {
        console.warn(
          "[MetadataService] AI binding not available for metadata generation"
        );
        return undefined;
      }

      // Build the semantic prompt
      const semanticPrompt = this.buildSemanticPrompt(
        fileName,
        fileKey,
        username,
        content,
        { includeContent, includeFilename, maxTags }
      );

      console.log(`[MetadataService] Generating metadata for: ${fileName}`);
      const response = await (this.env.AI as any).run(semanticPrompt);
      console.log(`[MetadataService] AI response received for: ${fileName}`);

      // Extract response text - handle both string and object responses
      const responseText =
        typeof response === "string"
          ? response
          : (response as any)?.response || JSON.stringify(response);

      // Parse the response
      const metadata = this.parseAIResponse(responseText);

      // Validate the metadata
      if (this.validateMetadata(metadata)) {
        return metadata;
      }

      return undefined;
    } catch (error) {
      console.error(
        `[MetadataService] Error generating metadata for ${fileName}:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Build the semantic prompt for AI
   */
  private buildSemanticPrompt(
    fileName: string,
    fileKey: string,
    username: string,
    content?: string,
    options: MetadataGenerationOptions = {}
  ): string {
    const { includeContent, includeFilename, maxTags } = options;

    let prompt = `Analyze the document and generate meaningful metadata.

`;

    if (includeFilename) {
      prompt += `Document filename: ${fileName}
File key: ${fileKey}
Username: ${username}

`;
    }

    if (includeContent && content) {
      prompt += `Document content preview: ${content.substring(0, 1000)}...

`;
    }

    prompt += `Based on the ${includeContent && content ? "content and " : ""}filename, generate:
1. A descriptive summary of what this document contains (not just "PDF document")
2. Up to ${maxTags} relevant tags that describe the topics, themes, or content type
3. Suggestions for how this document might be useful

Focus on extracting meaning from the filename structure and common naming patterns.

Please provide the response in this exact format:
DESCRIPTION: [your description here]
TAGS: [tag1, tag2, tag3]
SUGGESTIONS: [suggestion1, suggestion2, suggestion3]`;

    return prompt;
  }

  /**
   * Parse AI response to extract metadata
   */
  parseAIResponse(response: string): Metadata {
    const lines = response.split("\n");
    let description: string | undefined;
    let tags: string[] | undefined;
    let suggestions: string[] | undefined;

    for (const line of lines) {
      if (line.startsWith("DESCRIPTION:")) {
        const desc = line.replace("DESCRIPTION:", "").trim();
        if (desc) {
          description = desc;
        }
      } else if (line.startsWith("TAGS:")) {
        const tagsMatch = line.match(/TAGS:\s*\[(.*?)\]/);
        if (tagsMatch) {
          const parsedTags = tagsMatch[1]
            .split(",")
            .map((tag: string) => tag.trim().replace(/['"]/g, ""));
          if (parsedTags.length > 0) {
            tags = parsedTags;
          }
        }
      } else if (line.startsWith("SUGGESTIONS:")) {
        const suggestionsMatch = line.match(/SUGGESTIONS:\s*\[(.*?)\]/);
        if (suggestionsMatch) {
          const parsedSuggestions = suggestionsMatch[1]
            .split(",")
            .map((suggestion: string) =>
              suggestion.trim().replace(/['"]/g, "")
            );
          if (parsedSuggestions.length > 0) {
            suggestions = parsedSuggestions;
          }
        }
      }
    }

    return {
      description: description || "",
      tags: tags || [],
      suggestions: suggestions || [],
    };
  }

  /**
   * Validate metadata quality
   */
  validateMetadata(metadata: Metadata): boolean {
    // Check if we have meaningful content
    if (!metadata.description || metadata.description.trim().length === 0) {
      return false;
    }

    // Check if we have tags
    if (!metadata.tags || metadata.tags.length === 0) {
      return false;
    }

    // Check for generic descriptions
    const genericDescriptions = [
      "pdf document",
      "document",
      "file",
      "pdf file",
      "uploaded file",
    ];

    const descriptionLower = metadata.description.toLowerCase();
    if (genericDescriptions.some((desc) => descriptionLower.includes(desc))) {
      return false;
    }

    return true;
  }

  /**
   * Generate fallback metadata from filename
   */
  generateFallbackMetadata(fileName: string): Metadata {
    // Extract meaningful parts from filename
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    const words = nameWithoutExt
      .split(/[-_\s]+/)
      .filter((word) => word.length > 2)
      .map((word) => word.toLowerCase());

    // Generate basic description
    const description = `Document: ${nameWithoutExt}`;

    // Generate basic tags from filename words
    const tags = words.slice(0, 3);

    return {
      description,
      tags,
      suggestions: ["Review and update metadata manually"],
    };
  }
}
