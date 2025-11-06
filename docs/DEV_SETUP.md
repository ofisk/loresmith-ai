# LoreSmith AI Development Environment Setup

This guide will help you set up a complete development environment for LoreSmith AI using Cloudflare's development services.

## Overview

The development environment uses separate Cloudflare resources to avoid conflicts with production:

- **R2 Bucket**: `loresmith-files-dev`
- **D1 Database**: `loresmith-db-dev`
- **Vectorize Index**: `loresmith-embeddings-dev`
- **Queues**: `upload-events-dev`, `file-processing-dlq-dev`
- **AutoRAG**: `loresmith-library-autorag-dev`

## Prerequisites

1. **Node.js 22+** installed
2. **Cloudflare account** with Workers enabled
3. **Wrangler CLI** installed: `npm install -g wrangler`
4. **OpenAI API key** for AI functionality

## Quick Start

### 1. Automated Setup

Run the automated setup script:

```bash
npm run dev:setup
```

This script will:

- ✅ Check prerequisites
- ✅ Create configuration files
- ✅ Set up Cloudflare resources
- ✅ Run database migrations
- ✅ Validate the setup

### 2. Manual Configuration

After running the setup script, you need to complete these manual steps:

#### A. Update Environment Variables

Edit `.dev.vars` with your actual values:

```bash
# Required values
ADMIN_SECRET=your-secure-admin-secret
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: AutoRAG configuration
AUTORAG_BASE_URL=https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/autorag/rags/loresmith-library-autorag-dev
```

#### B. Set Cloudflare Secrets

```bash
# Set AutoRAG API token
wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc

# When prompted, enter your AutoRAG API token
```

#### C. Update Database ID

After creating the D1 database, update `wrangler.dev.jsonc` with the actual database ID:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "loresmith-db-dev",
    "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
  }
]
```

#### D. Create AutoRAG Instance

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **AI** → **AutoRAG**
3. Create a new RAG instance named `loresmith-library-autorag-dev`
4. Configure it with your dev R2 bucket and Vectorize index

## Development Commands

### Start Development Servers

```bash
# Terminal 1: Start backend (Cloudflare Workers)
npm run dev:cloudflare

# Terminal 2: Start frontend (Vite)
npm run start
```

### Database Operations

```bash
# Apply migrations
npm run migrate:dev

# View database
wrangler d1 execute loresmith-db-dev --config wrangler.dev.jsonc --command "SELECT * FROM file_metadata LIMIT 5"
```

### Deployment

```bash
# Deploy to dev environment
npm run deploy:dev

# Deploy to production
npm run deploy
```

### Validation

```bash
# Validate dev environment setup
./scripts/validate-dev.sh
```

## Environment Structure

```
loresmith-ai/
├── wrangler.dev.jsonc          # Dev Cloudflare configuration
├── .dev.vars                   # Dev environment variables
├── .dev.vars.template          # Template for .dev.vars
├── scripts/
│   ├── setup-dev.sh           # Automated setup script
│   └── validate-dev.sh        # Validation script
└── docs/
    └── dev-setup.md           # This file
```

## Troubleshooting

### Common Issues

#### 1. "Account ID not found"

- Make sure you're logged in: `wrangler login`
- Check your account ID: `wrangler whoami`

#### 2. "Database not found"

- Run the setup script again: `npm run dev:setup`
- Check if the database was created: `wrangler d1 list --config wrangler.dev.jsonc`

#### 3. "AutoRAG API token not set"

- Set the secret: `wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc`
- Verify it's set: `wrangler secret list --config wrangler.dev.jsonc`

#### 4. "CORS errors"

- Make sure both servers are running:
  - Backend: `npm run dev:cloudflare` (port 8787)
  - Frontend: `npm run start` (port 5173)

#### 5. "File upload fails"

- Check R2 bucket exists: `wrangler r2 bucket list --config wrangler.dev.jsonc`
- Verify bucket permissions in Cloudflare dashboard

### Validation Checklist

Run the validation script to check your setup:

```bash
./scripts/validate-dev.sh
```

This will verify:

- ✅ Wrangler CLI installed and logged in
- ✅ Configuration files exist
- ✅ Cloudflare resources created
- ✅ Secrets configured
- ✅ Database migrations applied

## Cost Estimation

Development environment costs (monthly):

- **D1 Database**: Free (5GB, 100k reads/day)
- **R2 Storage**: Free (10GB, 1M requests/month)
- **Workers**: Free (100k requests/day)
- **Vectorize**: Free (30M vectors)
- **AutoRAG**: Pay-per-use (~$0-5/month for dev usage)
- **Queues**: Free (1M messages/month)

**Total estimated cost: $0-10/month**

## Next Steps

1. **Test the setup**: Upload a file and verify it processes correctly
2. **Create test data**: Add some sample campaigns and files
3. **Run tests**: `npm test` to ensure everything works
4. **Start developing**: Make changes and see them reflected immediately

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Run the validation script: `./scripts/validate-dev.sh`
3. Check Cloudflare dashboard for resource status
4. Review the logs in the Wrangler dev console

For additional help, refer to:

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [AutoRAG Documentation](https://developers.cloudflare.com/ai-search/)
