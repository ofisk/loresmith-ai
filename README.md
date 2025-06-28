# LoreSmith MCP Router

Dungeouns & Dragons(DND) RAG

Tech stack: React frontend, Node.js backend, OpenAI GPT-4 via API, deployment via Cloudflare Workers

Features:

- Conversational 
- Supports PDF campaign upload (current limit: 200MB)
- Supports character management via (DND Beyond)[https://www.dndbeyond.com/]
- Maintains character state and helps plan character journeys

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
- Node.js 18+ and npm

### Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd loresmith-ai
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
Create a `.dev.vars` file:
```env
OPENAI_API_KEY=your_openai_api_key
ADMIN_SECRET=your_admin_secret_for_pdf_uploads
```

4. **Run locally**:
```bash
npm start
```

5. **Deploy to Cloudflare**:
```bash
npm run deploy
```

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
├── components/            # React components
│   ├── pdf-upload/        # PDF upload functionality
│   ├── button/            # UI components
│   └── ...
├── durable-objects/       # Durable Object implementations
└── styles.css             # Global styles
```

### MCP Server Integration
To connect an MCP server, uncomment and configure the MCP connection in `src/server.ts`:

```typescript
const mcpConnection = await this.mcp.connect(
  "https://your-mcp-server/sse"
);
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

