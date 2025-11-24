# LoreSmith

Dungeouns & Dragons(DND) RAG

Tech stack: React frontend, Node.js backend, OpenAI GPT-4 via API, deployment via Cloudflare Workers

Features:

- Conversational AI chat with campaign management
- Campaign creation and management with resource mapping
- File upload and processing (current limit: 500MB)
- Supports character management via [DND Beyond](https://www.dndbeyond.com/)
- Maintains character state and helps plan character journeys
- RAG (Retrieval-Augmented Generation) for campaign content
- **Bring Your Own OpenAI API Key**: Users can provide their own OpenAI API key when no default key is configured

## Architecture

### Core Components

- **Cloudflare Workers**: Serverless backend with global edge deployment
- **Durable Objects**: Persistent state management for chat sessions
- **R2 Storage**: Scalable object storage for uploaded files
- **React Frontend**: Modern, responsive user interface
- **AI SDK**: Integration with OpenAI and other AI providers

## Quick Start

### Prerequisites

- Cloudflare account
- OpenAI API key (optional - users can provide their own)
- Node.js 22+ and npm

### Infrastructure Management

For managing Cloudflare infrastructure, see the [scripts documentation](scripts/README.md):

- **Full Infrastructure Reset**: `./scripts/recreate-infrastructure.sh`
- **Specific Resource Reset**: `./scripts/reset-specific-resource.sh [worker|queues|d1|r2|vectorize|all]`

These scripts handle the complexities of Cloudflare resource dependencies and binding issues.

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
ADMIN_SECRET=your_admin_secret_for_file_uploads

# AutoRAG Configuration (optional for local development)
AUTORAG_API_URL=https://api.cloudflare.com/client/v4
AUTORAG_ACCOUNT_ID=your_cloudflare_account_id
AUTORAG_SEARCH_URL=your_autorag_search_endpoint
AUTORAG_API_TOKEN=your_autorag_api_token  # Ensure .dev.vars is in .gitignore
```

**Security Note**: For production, use Cloudflare Dashboard Environment Variables instead of storing tokens in `.vars` files.

### OpenAI API Key Configuration

The application supports two modes for OpenAI API key configuration:

1. **Local Development**: Set `OPENAI_API_KEY` in your `.dev.vars` file for local development and testing. This key will be used for all chat interactions during development.

2. **Production (User-Provided)**: In production, users must provide their own OpenAI API key during authentication. This key will be:
   - Validated against the OpenAI API
   - Stored securely in the Chat durable object
   - Used for all chat interactions in that session
   - Automatically cleared when the session expires
   - Never stored in the application's environment variables

### Running the Application Locally

This project consists of a React client and a Cloudflare Worker server. You need to start both for full functionality during development.

**⚠️ Important:** For normal development, use `npm run dev:cloudflare` (not `npm run dev`) to connect to remote Cloudflare resources. This ensures all features work properly, including database access and internal API calls.

#### Prerequisites for Local Development

1. **Install Wrangler CLI** (if not already installed):

```bash
npm install -g wrangler
```

2. **Authenticate with Cloudflare**:

```bash
wrangler login
```

#### 1. Set up Local Environment

Create a `.dev.vars` file with your configuration:

```bash
# Copy the example file
cp .dev.vars.example .dev.vars

# Edit the file with your credentials
```

Example `.dev.vars` content:

```env
# OpenAI API Key (optional - users can provide their own)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Admin Secret for authentication (required)
ADMIN_SECRET=your-admin-secret-here

# API URL for local development
VITE_API_URL=http://localhost:8787

# CORS settings for local development
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

#### 2. Set up Local Database

Run the database migrations to set up the local D1 database:

```bash
# Make the migration script executable
chmod +x scripts/migrate-local.sh

# Run local migrations
./scripts/migrate-local.sh
```

This will create all necessary tables including `user_openai_keys`, `campaigns`, `file_metadata`, etc.

#### 3. Build the Frontend (First Time Only)

Before starting the dev server for the first time, build the frontend to create the required `dist` directory:

```bash
npm run build
```

**Note**: You only need to do this once. During development, `npm start` will run Vite with hot module replacement, so you won't need to rebuild after each UI change.

#### 4. Start the Cloudflare Worker server

The backend server runs as a Cloudflare Worker. You have two options:

**Option A: Remote Resources (Recommended for full functionality)**

```bash
npm run dev:cloudflare
```

This runs your Worker locally but connects to **remote** Cloudflare resources:

- ✅ Remote D1 database (production/dev database)
- ✅ Remote R2 storage
- ✅ Remote Vectorize and other Cloudflare services
- ✅ Internal API calls work properly
- ✅ Full feature parity with production

**Option B: Fully Local (Limited functionality)**

```bash
npm run dev
```

This runs everything locally using mock/local resources:

- ❌ Local SQLite database (requires running migrations first)
- ❌ Limited Cloudflare service functionality
- ❌ Some internal API calls may fail
- ⚠️ Use only for testing database migrations or offline development

**For normal development, use `npm run dev:cloudflare`** to connect to remote resources while running locally at `http://localhost:8787`.

#### 5. Start the React client

In a separate terminal, start the client development server:

```bash
npm start
```

This will launch the React frontend at `http://localhost:5173` with hot module replacement for instant UI updates.

#### 6. Access the Application

Open your browser and navigate to:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8787

#### 7. Authenticate

When you first access the application, you'll need to authenticate:

1. **Username**: Enter any username you prefer
2. **Admin Key**: Use the `ADMIN_SECRET` value from your `.dev.vars` file
3. **OpenAI API Key**: Provide your own OpenAI API key (or use the one from `.dev.vars` if set)

#### Troubleshooting

**Authentication Issues:**

- Ensure your `ADMIN_SECRET` in `.dev.vars` matches what you enter in the admin key field
- Clear browser local storage if you encounter JWT verification errors
- Check that the database migrations ran successfully

**Database Issues:**

- If you get "no such table" errors, re-run the migration script
- Ensure Wrangler is authenticated with `wrangler login`

**Port Conflicts:**

- The backend runs on port 8787 by default
- The frontend runs on port 5173 by default
- If these ports are in use, you can change them in the respective configuration files

### Available NPM Scripts

The project includes several useful npm scripts for development:

```bash
# Development
npm start               # Start React development server (frontend)
npm run dev:cloudflare  # Start Worker with REMOTE Cloudflare resources (recommended)
npm run dev             # Start Worker with LOCAL resources only (limited functionality)
npm run build           # Build the React application

# Testing
npm test           # Run all tests
npm run validate   # Run linting, type checking, and tests

# Deployment
npm run deploy     # Build and deploy to Cloudflare (production)
npm run migrate    # Run database migrations

# Code Quality
npm run format     # Format code with Prettier
npm run check      # Run linting and type checking
```

#### 3. Deploy to Cloudflare

To deploy both the client and server to Cloudflare:

```bash
npm run deploy
```

## Configuration

### Environment Variables

#### Local Development (`.dev.vars`)

For local development, create a `.dev.vars` file with the following variables:

- `OPENAI_API_KEY`: Your OpenAI API key for AI chat functionality (local development only - not used in production)
- `ADMIN_SECRET`: Secret key for file upload authentication
- `VITE_API_URL`: API URL for local development (default: `http://localhost:8787`)
- `CORS_ALLOWED_ORIGINS`: CORS origins for local development (default: `http://localhost:5173,http://localhost:5174`)

**AutoRAG Configuration (Local Development):**

- `AUTORAG_API_URL`: Cloudflare AutoRAG API base URL (default: `https://api.cloudflare.com/client/v4`)
- `AUTORAG_ACCOUNT_ID`: Your Cloudflare account ID
- `AUTORAG_SEARCH_URL`: Your AutoRAG service search endpoint
- `AUTORAG_API_TOKEN`: Your AutoRAG API token (ensure `.dev.vars` is in `.gitignore`)

**Security Note**: For production, use Cloudflare Dashboard Environment Variables instead of storing tokens in `.vars` files.

#### Production (`.vars`)

For production deployment, the `.vars` file contains the following variables:

- `VITE_API_URL`: Production API URL (e.g., `https://ofisk.tech`)
- `CORS_ALLOWED_ORIGINS`: Production CORS origins (e.g., `https://ofisk.tech`)
- `OPENAI_API_KEY`: Optional default OpenAI API key (commented out by default - users provide their own)

**AutoRAG Configuration (Production):**

- `AUTORAG_API_URL`: Cloudflare AutoRAG API base URL (default: `https://api.cloudflare.com/client/v4`)
- `AUTORAG_ACCOUNT_ID`: Your Cloudflare account ID
- `AUTORAG_SEARCH_URL`: Your AutoRAG service search endpoint
- `AUTORAG_API_TOKEN`: **DO NOT put this in .vars file!** Use Cloudflare Dashboard Environment Variables instead.

**Security Note**: The `.vars` file is automatically ignored by git for security. The `ADMIN_SECRET` and `AUTORAG_API_TOKEN` are managed via Cloudflare Secrets Store or Dashboard Environment Variables in production and should not be included in the `.vars` file.

### Cloudflare Resources

- **R2 Bucket**: `loresmith-files` for file storage
- **Durable Objects**: `Chat` and `SessionFileTracker` for state management
- **Workers**: Main application deployment
- **AI Binding**: Cloudflare AI Gateway for AI model calls
- **AutoRAG**: Cloudflare AutoRAG service for document processing and search

### AutoRAG Configuration

The application integrates with Cloudflare AutoRAG for enhanced document processing:

#### **Security Best Practices:**

1. **Never commit API tokens to Git** - Use Cloudflare Dashboard Environment Variables
2. **Local Development**: Store tokens in `.dev.vars` (ensure it's in `.gitignore`)
3. **Production**: Use Cloudflare Dashboard → Workers & Pages → Settings → Environment Variables

#### **Setup Steps:**

1. **Get Your Account ID**: Found in dashboard URL: `dash.cloudflare.com/<account-id>`
2. **Create AutoRAG Service**: Set up AutoRAG in your Cloudflare account
3. **Generate API Token**: Create token with appropriate permissions
4. **Configure Environment Variables**: Set in Cloudflare Dashboard or local `.dev.vars`

#### **API Endpoints:**

- **Sync**: `PATCH /autorag/rags/{ragId}/sync` - Triggers document processing
- **Job Status**: `GET /autorag/rags/{ragId}/jobs/{jobId}` - Monitors processing progress
- **Job Logs**: `GET /autorag/rags/{ragId}/jobs/{jobId}/logs` - Detailed processing logs
- **Jobs List**: `GET /autorag/rags/{ragId}/jobs` - List all processing jobs

## Development

### Campaign Management

The application includes comprehensive campaign management functionality:

- **Campaign Creation**: Create new campaigns with custom names
- **Resource Management**: Add resources to campaigns
- **Character Integration**: Link D&D Beyond characters to campaigns
- **AI-Powered Planning**: Get AI suggestions for campaign development

### Authentication Flow

The application uses a JWT-based authentication system that works seamlessly in both local development and production:

1. **Admin Authentication**: Users authenticate with an admin key and username
2. **OpenAI Key Validation**: Users provide their own OpenAI API key (required for AI functionality)
3. **Session Management**: JWT tokens are used for session management with 24-hour expiration
4. **Secure Storage**: User-provided API keys are stored securely in the database
5. **Environment Flexibility**: Supports both local development (environment variables) and production (Cloudflare Secrets Store)

#### Local Development Authentication

For local development, the authentication system uses environment variables from `.dev.vars`:

- `ADMIN_SECRET`: Used for admin authentication and JWT signing
- `OPENAI_API_KEY`: Optional default key for development (users can still provide their own)

#### Production Authentication

In production, the system uses Cloudflare Secrets Store for secure secret management:

- Admin secrets are stored in Cloudflare Secrets Store
- JWT tokens are signed and verified using the same secret source
- All authentication is handled securely at the edge

### File Processing

Uploaded files are processed through a secure pipeline:

1. **Upload**: Files are uploaded directly to R2 storage via authenticated endpoints
2. **Processing**: Files are parsed and indexed for RAG functionality
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

## Documentation

For detailed information about specific aspects of the project, see:

- **[Storage Strategy](docs/STORAGE_STRATEGY.md)** - Comprehensive guide to data storage architecture using Cloudflare D1, R2, and Durable Objects
- **[Large File Support](docs/LARGE_FILE_SUPPORT.md)** - Details on handling large document files (up to 500MB) for D&D rulebooks and campaign guides
- **[Model Configuration](docs/MODEL_CONFIGURATION.md)** - Guide to configuring and changing AI models used throughout the application
- **[Testing Guide](docs/TESTING_GUIDE.md)** - Comprehensive testing documentation and campaign workflow test suite

## License

This project is licensed under the MIT License - see the LICENSE file for details.
