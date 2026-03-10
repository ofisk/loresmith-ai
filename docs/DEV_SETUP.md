# LoreSmith AI Development Environment Setup

This guide will help you set up a complete development environment for LoreSmith AI using Cloudflare's development services.

## Overview

The development environment uses separate Cloudflare resources to avoid conflicts with production:

- **R2 Bucket**: `loresmith-files-dev`
- **D1 Database**: `loresmith-db-dev`
- **Vectorize Index**: `loresmith-embeddings-dev`
- **Queues**: `upload-events-dev`, `file-processing-dlq-dev`

## Prerequisites

1. **Node.js 22+** installed
2. **Cloudflare account** with:
   - Workers enabled in your Cloudflare dashboard
   - Billing configured (even for free tier usage)
   - API tokens with appropriate permissions: Workers:Edit, Account:Read, Zone:Read (if using custom domains)
3. **Wrangler CLI** installed: `npm install -g wrangler`
4. **Anthropic API key** for text generation functionality

## Quick Start

### 1. Automated Setup

Run the automated setup script:

```bash
npm run dev:setup
```

This script will:

- Check prerequisites
- Create configuration files
- Set up Cloudflare resources
- Run database migrations
- Validate the setup

### 2. Manual Configuration

After running the setup script, you need to complete these manual steps:

#### A. Update environment variables

Copy `.dev.vars.template` to `.dev.vars` if the setup script did not create it. Edit `.dev.vars` with your actual values:

```bash
# Required values
ADMIN_SECRET=your-secure-admin-secret

# Optional: Anthropic API key for local development (default generation provider)
# Note: In production, users provide their own provider API key through the application
# ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key

# Optional: OpenAI API key for embeddings
# OPENAI_API_KEY=sk-your-openai-api-key

# CORS settings
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# API URL for local development
VITE_API_URL=http://localhost:8787

# Optional: Google OAuth (Sign in with Google)
# Get client ID and secret from Google Cloud Console.
# Add callback URL to OAuth client's Authorized redirect URIs: http://localhost:8787/auth/google/callback
# GOOGLE_OAUTH_CLIENT_ID=
# GOOGLE_OAUTH_CLIENT_SECRET=

# Optional: Username/password and email verification (Resend)
# APP_ORIGIN=http://localhost:5173
# RESEND_API_KEY=
# VERIFICATION_EMAIL_FROM=noreply@yourdomain.com
```

#### B. Update database ID

After creating the D1 database, the setup script prints the database ID (e.g. `Database ID: abc123-def456-ghi789`). Copy that ID and update `wrangler.dev.jsonc`. Or find it with: `wrangler d1 list --config wrangler.dev.jsonc`.

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "loresmith-db-dev",
    "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
  }
]
```

#### C. Cloudflare secrets

Verify secrets are set:

```bash
wrangler secret list --config wrangler.dev.jsonc
```

#### D. Resource verification

Verify all Cloudflare resources exist and are accessible:

```bash
wrangler r2 bucket list --config wrangler.dev.jsonc
wrangler d1 list --config wrangler.dev.jsonc
wrangler vectorize list --config wrangler.dev.jsonc
wrangler queues list --config wrangler.dev.jsonc
```

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
├── .dev.vars                   # Dev environment variables (gitignored)
├── .dev.vars.template          # Template for .dev.vars
├── .vars                       # Production env vars (gitignored; copy from .vars.example)
├── .vars.example               # Reference template for .vars
├── scripts/
│   ├── setup-dev.sh           # Automated setup script
│   └── validate-dev.sh        # Validation script
└── docs/
    └── DEV_SETUP.md           # This file
```

## Troubleshooting

### Common Issues

#### 1. "Account ID not found"

- Make sure you're logged in: `wrangler login`
- Check your account ID: `wrangler whoami`

#### 2. "Database ID not found"

- The setup script shows the database ID when creating the D1 database; copy it and update `wrangler.dev.jsonc`
- Or find it with: `wrangler d1 list --config wrangler.dev.jsonc`

#### 3. "Database not found"

- Run the setup script again: `npm run dev:setup`
- Check if the database was created: `wrangler d1 list --config wrangler.dev.jsonc`

#### 4. "Authentication errors"

- Ensure `ADMIN_SECRET` is set in `.dev.vars`
- Clear browser local storage if JWT verification errors occur
- Check that database migrations ran successfully

#### 5. "CORS errors"

- Make sure both servers are running:
  - Backend: `npm run dev:cloudflare` (port 8787)
  - Frontend: `npm run start` (port 5173)
- Check `.dev.vars` has correct CORS origins

#### 6. "File upload fails"

- Check R2 bucket exists: `wrangler r2 bucket list --config wrangler.dev.jsonc`
- Verify bucket permissions in Cloudflare dashboard

### Validation Checklist

Run the validation script to check your setup:

```bash
./scripts/validate-dev.sh
```

This will verify:

- Wrangler CLI installed and logged in
- Configuration files exist
- Cloudflare resources created
- Database migrations applied

## Cost Estimation

Development environment costs (monthly):

- **D1 Database**: Free (5GB, 100k reads/day)
- **R2 Storage**: Free (10GB, 1M requests/month)
- **Workers**: Free (100k requests/day)
- **Vectorize**: Free (30M vectors)
- **Queues**: Free (1M messages/month)

**Total estimated cost: $0/month** (all services within free tier limits)

## Next Steps

1. **Test the setup**: Upload a file and verify it processes and indexes correctly
2. **Create test data**: Add some sample campaigns and files
3. **Run tests**: `npm test` to ensure everything works
4. **Start developing**: Make changes and see them reflected immediately

## Quick reference

### Essential commands

```bash
# Setup (run once)
npm run dev:setup

# Development (run daily)
npm run dev:cloudflare  # Terminal 1
npm run start          # Terminal 2

# Validation (run when issues occur)
./scripts/validate-dev.sh
```

### Key files to edit

- `.dev.vars` - Environment variables
- `wrangler.dev.jsonc` - Database ID and account ID

### Important URLs

- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Workers section**: https://dash.cloudflare.com → Workers & Pages
- **Local development**: http://localhost:5173 (frontend), http://localhost:8787 (backend)

## Dependency notes

The following packages were removed as unused (March 2025, [issue #497](https://github.com/ofisk/loresmith-ai/issues/497)):

- **express**, **multer**, **@types/express**, **@types/multer**: Node.js server frameworks incompatible with Cloudflare Workers. This project uses **Hono** for routing and handles multipart uploads directly via R2 bindings.
- **@aws-sdk/client-s3**, **aws4fetch**: S3 SDK and AWS request signing. This project uses Cloudflare **R2 bindings** (`c.env.R2`) directly; scripts use the Cloudflare REST API or AWS CLI, not npm SDKs.

Do not re-add these packages; they are not compatible with or needed for the Workers runtime.

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Run the validation script: `./scripts/validate-dev.sh`
3. Check Cloudflare dashboard for resource status
4. Review the logs in the Wrangler dev console

For additional help, refer to:

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
