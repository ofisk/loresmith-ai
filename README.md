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
- **Bring Your Own OpenAI API Key**: Users can provide their own OpenAI API key when no default key is configured

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
- OpenAI API key (optional - users can provide their own)
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
OPENAI_API_KEY=your_openai_api_key  # Optional - users can provide their own
ADMIN_SECRET=your_admin_secret_for_pdf_uploads
```

### OpenAI API Key Configuration

The application supports two modes for OpenAI API key configuration:

1. **Default Key (Recommended)**: Set `OPENAI_API_KEY` in your environment variables. This key will be used for all chat interactions.

2. **User-Provided Key**: If no default key is set, users will be prompted to provide their own OpenAI API key during authentication. This key will be:
   - Validated against the OpenAI API
   - Stored securely in the Chat durable object
   - Used for all chat interactions in that session
   - Automatically cleared when the session expires

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

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key for AI chat functionality (optional)
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
- **Resource Management**: Add PDF resources to campaigns
- **Character Integration**: Link D&D Beyond characters to campaigns
- **AI-Powered Planning**: Get AI suggestions for campaign development

### Authentication Flow

The application uses a JWT-based authentication system:

1. **Admin Authentication**: Users authenticate with an admin key and username
2. **OpenAI Key Validation**: If no default key is set, users provide their own OpenAI API key
3. **Session Management**: JWT tokens are used for session management with 24-hour expiration
4. **Secure Storage**: User-provided API keys are stored securely in Durable Objects

### PDF Processing

PDF files are processed through a secure pipeline:

1. **Upload**: Files are uploaded directly to R2 storage via presigned URLs
2. **Processing**: PDFs are parsed and indexed for RAG functionality
3. **Metadata**: Users can add descriptions and tags to uploaded files
4. **Campaign Integration**: Files can be associated with specific campaigns

## Security

- **JWT Authentication**: Secure token-based authentication
- **Admin Key Protection**: Admin secrets are required for sensitive operations
- **API Key Validation**: User-provided OpenAI keys are validated before use
- **Secure Storage**: Sensitive data is stored in Durable Objects with encryption
- **Session Expiration**: Automatic cleanup of expired sessions and keys

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
