# File Analysis System

The File Analysis System automatically analyzes files after they've been indexed by the Library RAG Service to generate rich metadata for intelligent resource recommendations.

## Overview

This system enhances the user experience by:

1. **Automatic Analysis**: Files are automatically analyzed after RAG indexing completes
2. **Rich Metadata**: Generates comprehensive metadata including content type, difficulty level, target audience, and campaign themes
3. **Smart Recommendations**: Enables agents to suggest relevant resources based on user needs and campaign context
4. **Intelligent Discovery**: Helps users find the right resources for their campaigns

## How It Works

### 1. File Upload Flow

```
File Upload → RAG Indexing → File Analysis → Enhanced Metadata Storage
```

### 2. Analysis Process

1. **File Indexing**: File is uploaded and indexed by the Library RAG Service
2. **Analysis Trigger**: After successful indexing, analysis is automatically triggered
3. **Content Analysis**: System queries the RAG service to understand file content
4. **Metadata Generation**: Creates structured metadata for recommendations
5. **Storage**: Enhanced metadata is stored in the database

### 3. Metadata Fields

The system generates the following metadata fields:

| Field                        | Description                        | Example Values                                               |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `content_summary`            | Brief description of the resource  | "A detailed map of St. Andral's Church with secret passages" |
| `key_topics`                 | Array of key themes/topics         | `["church", "secrets", "passages", "gothic"]`                |
| `content_type_categories`    | Array of content types             | `["map", "character", "adventure"]`                          |
| `difficulty_level`           | Complexity level                   | `beginner`, `intermediate`, `advanced`, `expert`             |
| `target_audience`            | Who the resource is for            | `players`, `dms`, `both`                                     |
| `campaign_themes`            | Campaign themes this fits          | `["fantasy", "gothic", "mystery"]`                           |
| `recommended_campaign_types` | Types of campaigns this works with | `["story-driven", "exploration", "mystery"]`                 |
| `content_quality_score`      | Quality rating (1-10)              | `8`                                                          |
| `analysis_status`            | Current analysis status            | `pending`, `analyzing`, `completed`, `failed`                |

## API Endpoints

### File Analysis

- `POST /file-analysis/analyze/:fileKey` - Analyze a specific file
- `GET /file-analysis/status/:fileKey` - Get analysis status
- `GET /file-analysis/pending` - Get files pending analysis
- `POST /file-analysis/analyze-all` - Trigger analysis for all pending files

### Recommendations

- `POST /file-analysis/recommendations` - Get file recommendations based on filters

## Usage Examples

### Getting File Recommendations

```typescript
// Get map resources for beginner players
const recommendations = await fetch("/file-analysis/recommendations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content_type_categories: "map",
    difficulty_level: "beginner",
    target_audience: "players",
    limit: 5,
  }),
});
```

### Checking Analysis Status

```typescript
// Check if a file has been analyzed
const status = await fetch("/file-analysis/status/my-file-key");
const { analysis_status, last_analyzed_at } = await status.json();
```

## Agent Tools

Agents can use the following tools to interact with the file analysis system:

### `getFileRecommendations`

Get file recommendations based on content analysis and metadata.

**Parameters:**

- `content_type_categories`: Filter by content types
- `difficulty_level`: Filter by difficulty level
- `target_audience`: Filter by target audience
- `campaign_themes`: Filter by campaign themes
- `min_quality_score`: Minimum quality score
- `limit`: Maximum number of recommendations

### `getFileAnalysisStatus`

Check the analysis status of a specific file.

**Parameters:**

- `file_key`: The file key to check

### `triggerFileAnalysis`

Trigger analysis for a file that hasn't been analyzed yet.

**Parameters:**

- `file_key`: The file key to analyze

## Database Schema

The system extends the `file_metadata` table with new columns:

```sql
-- Enhanced metadata fields
ALTER TABLE file_metadata ADD COLUMN content_summary TEXT;
ALTER TABLE file_metadata ADD COLUMN key_topics TEXT; -- JSON array
ALTER TABLE file_metadata ADD COLUMN content_type_categories TEXT; -- JSON array of content types
ALTER TABLE file_metadata ADD COLUMN difficulty_level TEXT;
ALTER TABLE file_metadata ADD COLUMN target_audience TEXT;
ALTER TABLE file_metadata ADD COLUMN campaign_themes TEXT; -- JSON array
ALTER TABLE file_metadata ADD COLUMN recommended_campaign_types TEXT; -- JSON array
ALTER TABLE file_metadata ADD COLUMN content_quality_score INTEGER;
ALTER TABLE file_metadata ADD COLUMN last_analyzed_at DATETIME;
ALTER TABLE file_metadata ADD COLUMN analysis_status TEXT DEFAULT 'pending';
ALTER TABLE file_metadata ADD COLUMN analysis_error TEXT;
```

## Configuration

The system can be configured via the `FileAnalysisOrchestratorConfig`:

```typescript
const config = {
  autoTriggerAnalysis: true, // Automatically trigger analysis after indexing
  batchSize: 5, // Process files in batches of 5
  delayBetweenBatches: 1000, // 1 second delay between batches
};
```

## Error Handling

The system handles various error scenarios:

1. **Indexing Not Complete**: Files are marked as `waiting_for_indexing`
2. **Analysis Failures**: Files are marked as `failed` with error details
3. **RAG Errors**: Graceful fallback to basic metadata generation
4. **Database Errors**: Proper error logging and status updates

## Monitoring and Debugging

### Logs

The system provides comprehensive logging:

- `[FileAnalysis]` - General analysis operations
- `[FileAnalysisOrchestrator]` - Orchestration and batch processing

### Status Tracking

Monitor analysis progress through:

- Individual file status endpoints
- Batch analysis results
- Analysis statistics per user

## Best Practices

1. **Batch Processing**: Use batch operations for multiple files to avoid overwhelming the system
2. **Error Handling**: Always check analysis status before using recommendations
3. **Filtering**: Use specific filters to get the most relevant recommendations
4. **Monitoring**: Track analysis status to ensure files are properly processed

## Future Enhancements

Potential improvements to the system:

1. **AI-Powered Analysis**: Use LLMs to generate more sophisticated metadata
2. **User Feedback**: Incorporate user ratings and feedback into quality scores
3. **Collaborative Filtering**: Suggest resources based on similar user preferences
4. **Content Clustering**: Group similar resources for better discovery
5. **Real-time Updates**: WebSocket notifications for analysis completion

## Troubleshooting

### Common Issues

1. **Files Stuck in "waiting_for_indexing"**
   - Check if RAG indexing has completed
   - Verify RAG service configuration

2. **Analysis Failures**
   - Check logs for specific error messages
   - Verify file content is accessible to the RAG service

3. **Slow Analysis**
   - Adjust batch size and delay configuration
   - Check RAG service rate limits

### Debug Commands

```bash
# Check analysis status for a file
curl -H "Authorization: Bearer <jwt>" \
  "https://your-domain.com/file-analysis/status/<file-key>"

# Trigger analysis for all pending files
curl -X POST -H "Authorization: Bearer <jwt>" \
  "https://your-domain.com/file-analysis/analyze-all"

# Get files pending analysis
curl -H "Authorization: Bearer <jwt>" \
  "https://your-domain.com/file-analysis/pending"
```
