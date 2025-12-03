import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { SearchQuery, SearchResult } from "@/types/upload";

/**
 * Service for searching library files
 */
export class LibrarySearchService {
  constructor(private env: Env) {}

  /**
   * Search files in the user's library
   */
  async searchFiles(query: SearchQuery): Promise<SearchResult[]> {
    const {
      query: searchQuery,
      userId,
      limit = 20,
      offset = 0,
      includeSemantic = true,
    } = query;

    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get all files for the user
      const files = await fileDAO.getFilesForRag(userId);

      // Filter files based on search query
      let filteredFiles = files;
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filteredFiles = files.filter((file: any) => {
          const filename = (file.file_name || "").toLowerCase();
          const description = (file.description || "").toLowerCase();
          const tags = (file.tags || "[]").toLowerCase();

          return (
            filename.includes(searchLower) ||
            description.includes(searchLower) ||
            tags.includes(searchLower)
          );
        });
      }

      // Apply pagination
      const paginatedFiles = filteredFiles.slice(offset, offset + limit);

      const searchResults: SearchResult[] = paginatedFiles.map((file: any) => {
        return {
          id: file.id,
          file_key: file.file_key,
          file_name: file.file_name,
          description: file.description,
          tags: JSON.parse(file.tags || "[]"),
          file_size: file.file_size,
          created_at: file.created_at,
          status: file.status,
        };
      });

      // NOTE: Currently uses keyword-based search. Future enhancement:
      // Implement semantic search using vector embeddings for better
      // relevance matching, especially for similar content.
      if (includeSemantic && searchQuery.trim()) {
        console.log(
          `[LibrarySearchService] Semantic search not yet implemented for query: ${searchQuery}`
        );
      }

      console.log(`[LibrarySearchService] Search results:`, {
        query: searchQuery,
        userId,
        resultsCount: searchResults.length,
      });

      return searchResults;
    } catch (error) {
      console.error(`[LibrarySearchService] Search error:`, error);
      return [];
    }
  }
}
