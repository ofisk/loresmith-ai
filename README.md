# LoreSmith MCP Router

Dungeouns & Dragons(DND) RAG

Tech stack: React frontend, Node.js backend, OpenAI GPT-4 via API, deployment via Cloudflare Workers

Features:

- Conversational AI chat with campaign management
- Campaign creation and management with resource mapping
- PDF campaign upload and processing (current limit: 200MB)
- Supports character management via [DND Beyond](https://www.dndbeyond.com/)
- Maintains character state and helps plan character journeys
- RAG (Retrieval-Augmented Generation) for campaign content

## Architecture

### Core Components

- **Cloudflare Workers**: Serverless backend with global edge deployment
- **Durable Objects**: Persistent state management for chat sessions
- **R2 Storage**: Scalable object storage for PDF files
- **React Frontend**: Modern, responsive user interface
- **AI SDK**: Integration with OpenAI and other AI providers

## Quick Start

### Prerequisites

- Cloudflare account
- OpenAI API key
- Node.js 22+ and npm

### Installation

1. **Clone the repository**:

2. **Install dependencies**:

```bash
npm install
```

3. **Set up environment variables**:
   Create a `.dev.vars` file (you can copy the example file and fill it out):

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` and provide your credentials:

```env
OPENAI_API_KEY=your_openai_api_key
ADMIN_SECRET=your_admin_secret_for_pdf_uploads
```

### Running the Application Locally

This project consists of a React client and a Cloudflare Worker server. You need to start both for full functionality during development.

#### 1. Start the Cloudflare Worker server

The backend server runs as a Cloudflare Worker. Start it using [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
wrangler dev
```

This will start the server locally and provide you with a local endpoint for API requests.

#### 2. Start the React client

In a separate terminal, start the client development server:

```bash
npm start
```

This will launch the React frontend, typically at [http://localhost:3000](http://localhost:3000).

#### 3. Deploy to Cloudflare

To deploy both the client and server to Cloudflare:

```bash
npm run deploy
```

**Important Deployment Notes:**

- **For initial deployments or when Durable Object migrations are pending**, use:

  ```bash
  npm run deploy
  ```

- **For gradual deployments (after migrations are applied)**, use:
  ```bash
  npm run deploy:gradual
  ```

**Durable Object Migrations:**
If you encounter the error "migrations must be fully applied by running 'wrangler deploy'", it means there are pending Durable Object migrations. Always use `npm run deploy` (which uses `wrangler deploy`) to apply migrations before using gradual deployments.

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key for AI chat functionality
- `ADMIN_SECRET`: Secret key for PDF upload authentication

### Cloudflare Resources

- **R2 Bucket**: `loresmith-pdfs` for file storage
- **Durable Objects**: `Chat` and `SessionFileTracker` for state management
- **Workers**: Main application deployment

## Development

### Project Structure

```
src/
├── app.tsx                # Main React application
├── server.ts              # Cloudflare Worker entry point
├── tools.ts               # AI tool definitions
├── utils.ts               # Utility functions
├── shared.ts              # Shared types and constants
├── agents/                # Agent implementations
│   └── campaign.ts        # Campaign management agent
├── components/            # React components
│   ├── campaign/          # Campaign management UI
│   ├── pdf-upload/        # PDF upload functionality
│   ├── button/            # UI components
│   └── ...
├── durable-objects/       # Durable Object implementations
├── hooks/                 # React hooks
├── types/                 # TypeScript type definitions
└── styles.css             # Global styles

tests/
├── campaign/              # Campaign functionality tests
├── pdf/                   # PDF upload tests
├── tools/                 # Tool definition tests
└── chat/                  # Chat functionality tests
```

### Campaign Management

The application includes comprehensive campaign management functionality:

- **Campaign Creation**: Create new campaigns with custom names
- **Resource Management**: Add and remove resources (PDFs, documents, images, etc.) from campaigns
- **Campaign Indexing**: Trigger RAG indexing for campaign content
- **Campaign Listing**: View all campaigns and their resources

Campaign routes are handled by the dedicated campaign agent (`src/agents/campaign.ts`):

- `GET /campaigns` - List all campaigns
- `POST /campaigns` - Create a new campaign
- `GET /campaigns/:id` - Get campaign details
- `POST /campaigns/:id/resource` - Add resource to campaign
- `DELETE /campaigns/:id/resource/:resourceId` - Remove resource from campaign
- `DELETE /campaigns/:id` - Delete campaign
- `POST /campaign/:id/index` - Trigger campaign indexing

### MCP Server Integration

To connect an MCP server, uncomment and configure the MCP connection in `src/server.ts`:

```typescript
const mcpConnection = await this.mcp.connect("https://your-mcp-server/sse");
```

## Testing

The project includes comprehensive test coverage for all major functionality:

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test tests/campaign/     # Campaign functionality tests
npm test tests/pdf/          # PDF upload tests
npm test tests/tools/        # Tool definition tests
npm test tests/chat/         # Chat functionality tests
```

### Test Structure

- **Campaign Tests**: API endpoints, hooks, tools, and durable objects for campaign management
- **PDF Tests**: Upload functionality, authentication, and file processing
- **Tool Tests**: AI tool definitions and execution logic
- **Chat Tests**: Chat functionality and message handling

### Test-Driven Development

The project follows TDD principles with comprehensive test coverage for:

- API endpoint validation and error handling
- React hooks for data fetching and state management
- AI tool definitions and execution
- Durable Object operations and KV storage
- Component rendering and user interactions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request
