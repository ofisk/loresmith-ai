# 🤖 Chat Agent Starter Kit

![agents-header](https://github.com/user-attachments/assets/f6d99eeb-1803-4495-9c5e-3cf07a37b402)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building AI-powered chat agents using Cloudflare's Agent platform, powered by [`agents`](https://www.npmjs.com/package/agents). This project provides a foundation for creating interactive chat experiences with AI, complete with a modern UI and tool integration capabilities.

## Features

- 💬 Interactive chat interface with AI
- 🛠️ Built-in tool system with human-in-the-loop confirmation
- 📅 Advanced task scheduling (one-time, delayed, and recurring via cron)
- 🌓 Dark/Light theme support
- ⚡️ Real-time streaming responses
- 🔄 State management and chat history
- 🎨 Modern, responsive UI
- 📄 PDF upload functionality with R2 storage

## PDF Upload Architecture

This application uses a hybrid approach for PDF uploads:

### 1. DIRECT API ENDPOINTS (Primary method for UI uploads)
- **Purpose**: User-initiated uploads from the frontend
- **Performance**: Fast, direct server-to-R2 communication
- **Benefits**: No agent overhead, immediate feedback, real-time progress
- **Endpoints**: `/api/generate-upload-url`, `/api/upload-pdf`, `/api/upload-pdf-direct`

### 2. AGENT TOOLS (Secondary method for AI-driven operations)
- **Purpose**: AI-initiated uploads and complex operations
- **Context**: Run within agent environment with full database access
- **Benefits**: Context awareness, integration with AI workflows
- **Tools**: `generatePdfUploadUrl`, `uploadPdfFile`, `confirmPdfUpload`

### Why this hybrid approach?
- UI uploads need speed and reliability (direct APIs)
- AI operations need context and intelligence (agent tools)
- Both systems can coexist and complement each other

### File size handling:
- Small files (< 50MB): Base64 upload via `/api/upload-pdf-direct`
- Large files (≥ 50MB): Presigned URL via `/api/generate-upload-url`

## PDF Metadata Management

The application uses **Cloudflare KV** for storing PDF metadata, providing fast and cost-effective metadata management separate from file storage.

### Metadata Storage Features

#### Core Metadata Fields
- `id`: Unique identifier for the PDF
- `key`: R2 object key for file retrieval
- `filename`: Original filename
- `fileSize`: File size in bytes
- `description`: Optional description
- `tags`: Array of tags for categorization
- `uploadedAt`: ISO timestamp of upload
- `uploadedBy`: User identifier
- `contentType`: MIME type (application/pdf)
- `status`: Upload status (uploading/completed/error)

#### Additional Metadata
- `pageCount`: Number of pages (extracted from PDF)
- `title`: PDF title
- `author`: PDF author
- `subject`: PDF subject
- `keywords`: PDF keywords
- `customFields`: User-defined key-value pairs

### API Endpoints

#### Upload Endpoints
```javascript
// Generate upload URL (large files)
POST /api/generate-upload-url
{
  "filename": "document.pdf",
  "fileSize": 1048576,
  "description": "Research paper",
  "tags": ["research", "academic"]
}

// Direct upload (small files)
POST /api/upload-pdf-direct
{
  "filename": "document.pdf",
  "fileData": "base64-encoded-content",
  "description": "Research paper",
  "tags": ["research", "academic"]
}
```

#### Management Endpoints
```javascript
// List PDFs with filtering
GET /api/pdfs?limit=50&tags=research&status=completed

// Get specific PDF metadata
GET /api/pdfs/{id}

// Update PDF metadata
PUT /api/pdfs/{id}
{
  "description": "Updated description",
  "tags": ["updated", "tags"]
}

// Delete PDF (with optional file deletion)
DELETE /api/pdfs/{id}?deleteFile=true

// Search PDFs
GET /api/pdfs/search/{query}?limit=20

// Get PDFs by tag
GET /api/pdfs/tag/{tag}?limit=50

// Get storage statistics
GET /api/pdfs/stats
```

### Benefits of KV Storage

1. **Performance**: Sub-millisecond read/write operations
2. **Cost-effective**: Much cheaper than R2 for metadata
3. **Scalability**: Automatic scaling with traffic
4. **Indexing**: Built-in support for tag-based filtering
5. **Reliability**: 99.9% availability SLA

### Metadata Service Features

- **Automatic indexing**: Tags are automatically indexed for fast filtering
- **Search functionality**: Full-text search across filename, description, and tags
- **Pagination**: Efficient cursor-based pagination
- **Statistics**: Storage usage and tag distribution analytics
- **Error handling**: Graceful error recovery and status tracking

### Configuration

Add the KV namespace to your `wrangler.jsonc`:

```json
{
  "kv_namespaces": [
    {
      "binding": "PDF_METADATA",
      "id": "your-kv-namespace-id",
      "preview_id": "your-preview-kv-namespace-id"
    }
  ]
}
```

Create the KV namespace:
```bash
wrangler kv:namespace create "PDF_METADATA"
wrangler kv:namespace create "PDF_METADATA" --preview
```

## Prerequisites

- Cloudflare account
- OpenAI API key

## Quick Start

1. Create a new project:

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment:

Create a `.dev.vars` file:

```env
OPENAI_API_KEY=your_openai_api_key
```

4. Run locally:

```bash
npm start
```

5. Deploy:

```bash
npm run deploy
```

## Project Structure

```
├── src/
│   ├── app.tsx        # Chat UI implementation
│   ├── server.ts      # Chat agent logic
│   ├── tools.ts       # Tool definitions
│   ├── utils.ts       # Helper functions
│   └── styles.css     # UI styling
```

## Customization Guide

### Adding New Tools

Add new tools in `tools.ts` using the tool builder:

```typescript
// Example of a tool that requires confirmation
const searchDatabase = tool({
  description: "Search the database for user records",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  // No execute function = requires confirmation
});

// Example of an auto-executing tool
const getCurrentTime = tool({
  description: "Get current server time",
  parameters: z.object({}),
  execute: async () => new Date().toISOString(),
});

// Scheduling tool implementation
const scheduleTask = tool({
  description:
    "schedule a task to be executed at a later time. 'when' can be a date, a delay in seconds, or a cron pattern.",
  parameters: z.object({
    type: z.enum(["scheduled", "delayed", "cron"]),
    when: z.union([z.number(), z.string()]),
    payload: z.string(),
  }),
  execute: async ({ type, when, payload }) => {
    // ... see the implementation in tools.ts
  },
});
```

To handle tool confirmations, add execution functions to the `executions` object:

```typescript
export const executions = {
  searchDatabase: async ({
    query,
    limit,
  }: {
    query: string;
    limit?: number;
  }) => {
    // Implementation for when the tool is confirmed
    const results = await db.search(query, limit);
    return results;
  },
  // Add more execution handlers for other tools that require confirmation
};
```

Tools can be configured in two ways:

1. With an `execute` function for automatic execution
2. Without an `execute` function, requiring confirmation and using the `executions` object to handle the confirmed action. NOTE: The keys in `executions` should match `toolsRequiringConfirmation` in `app.tsx`.

### Use a different AI model provider

The starting [`server.ts`](https://github.com/cloudflare/agents-starter/blob/main/src/server.ts) implementation uses the [`ai-sdk`](https://sdk.vercel.ai/docs/introduction) and the [OpenAI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai), but you can use any AI model provider by:

1. Installing an alternative AI provider for the `ai-sdk`, such as the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai) or [`anthropic`](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) provider:
2. Replacing the AI SDK with the [OpenAI SDK](https://github.com/openai/openai-node)
3. Using the Cloudflare [Workers AI + AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/workersai/#workers-binding) binding API directly

For example, to use the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai), install the package:

```sh
npm install workers-ai-provider
```

Add an `ai` binding to `wrangler.jsonc`:

```jsonc
// rest of file
  "ai": {
    "binding": "AI"
  }
// rest of file
```

Replace the `@ai-sdk/openai` import and usage with the `workers-ai-provider`:

```diff
// server.ts
// Change the imports
- import { openai } from "@ai-sdk/openai";
+ import { createWorkersAI } from 'workers-ai-provider';

// Create a Workers AI instance
+ const workersai = createWorkersAI({ binding: env.AI });

// Use it when calling the streamText method (or other methods)
// from the ai-sdk
- const model = openai("gpt-4o-2024-11-20");
+ const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b")
```

Commit your changes and then run the `agents-starter` as per the rest of this README.

### Modifying the UI

The chat interface is built with React and can be customized in `app.tsx`:

- Modify the theme colors in `styles.css`
- Add new UI components in the chat container
- Customize message rendering and tool confirmation dialogs
- Add new controls to the header

### Example Use Cases

1. **Customer Support Agent**

   - Add tools for:
     - Ticket creation/lookup
     - Order status checking
     - Product recommendations
     - FAQ database search

2. **Development Assistant**

   - Integrate tools for:
     - Code linting
     - Git operations
     - Documentation search
     - Dependency checking

3. **Data Analysis Assistant**

   - Build tools for:
     - Database querying
     - Data visualization
     - Statistical analysis
     - Report generation

4. **Personal Productivity Assistant**

   - Implement tools for:
     - Task scheduling with flexible timing options
     - One-time, delayed, and recurring task management
     - Task tracking with reminders
     - Email drafting
     - Note taking

5. **Scheduling Assistant**
   - Build tools for:
     - One-time event scheduling using specific dates
     - Delayed task execution (e.g., "remind me in 30 minutes")
     - Recurring tasks using cron patterns
     - Task payload management
     - Flexible scheduling patterns

Each use case can be implemented by:

1. Adding relevant tools in `tools.ts`
2. Customizing the UI for specific interactions
3. Extending the agent's capabilities in `server.ts`
4. Adding any necessary external API integrations

## Learn More

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## License

MIT
