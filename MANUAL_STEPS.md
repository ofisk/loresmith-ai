# Manual Steps Required for Dev Environment Setup

This document outlines the steps you need to complete manually after running the automated setup script.

## 🔧 Manual Steps Checklist

### 1. Cloudflare Account Setup

- [ ] **Create Cloudflare account** (if you don't have one)
- [ ] **Enable Workers** in your Cloudflare dashboard
- [ ] **Set up billing** (even for free tier usage)
- [ ] **Generate API tokens** with appropriate permissions:
  - Workers:Edit
  - Account:Read
  - Zone:Read (if using custom domains)

### 2. Environment Variables Configuration

- [ ] **Copy `.dev.vars.template` to `.dev.vars`**
- [ ] **Set `ADMIN_SECRET`** - Generate a secure random string
- [ ] **Set `OPENAI_API_KEY`** - Your OpenAI API key
- [ ] **Update `AUTORAG_BASE_URL`** with your actual account ID

### 3. Cloudflare Secrets Setup

- [ ] **Set AutoRAG API token**:
  ```bash
  wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc
  ```
- [ ] **Verify secrets are set**:
  ```bash
  wrangler secret list --config wrangler.dev.jsonc
  ```

### 4. Resource Configuration

- [ ] **Update database ID** in `wrangler.dev.jsonc` after D1 creation
- [ ] **Verify R2 bucket** exists and has correct permissions
- [ ] **Check Vectorize index** is created and accessible
- [ ] **Confirm queues** are created and configured

### 5. AutoRAG Instance Setup

- [ ] **Go to Cloudflare Dashboard** → AI → AutoRAG
- [ ] **Create new RAG instance** named `loresmith-library-autorag-dev`
- [ ] **Configure data sources**:
  - R2 bucket: `loresmith-files-dev`
  - Vectorize index: `loresmith-embeddings-dev`
- [ ] **Set up indexing rules** for your file types
- [ ] **Test the AutoRAG instance** with a sample file

### 6. Final Validation

- [ ] **Run validation script**: `./scripts/validate-dev.sh`
- [ ] **Test file upload** functionality
- [ ] **Verify AutoRAG indexing** works
- [ ] **Check database migrations** are applied
- [ ] **Test frontend-backend communication**

## 🚨 Critical Manual Steps

These steps are **required** and cannot be automated:

### AutoRAG API Token

```bash
# This must be done manually - the script cannot access your Cloudflare dashboard
wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc
```

### Database ID Update

After running the setup script, you'll see output like:

```
✅ D1 database 'loresmith-db-dev' created
Database ID: abc123-def456-ghi789
```

You must manually update `wrangler.dev.jsonc`:

```json
"database_id": "abc123-def456-ghi789"  // Replace with actual ID
```

### AutoRAG Instance Creation

This must be done in the Cloudflare dashboard:

1. Navigate to **AI** → **AutoRAG**
2. Click **Create RAG**
3. Name: `loresmith-library-autorag-dev`
4. Configure data sources and indexing rules

## 🔍 Verification Commands

After completing manual steps, verify everything works:

```bash
# Check all resources exist
wrangler r2 bucket list --config wrangler.dev.jsonc
wrangler d1 list --config wrangler.dev.jsonc
wrangler vectorize list --config wrangler.dev.jsonc
wrangler queues list --config wrangler.dev.jsonc

# Check secrets are set
wrangler secret list --config wrangler.dev.jsonc

# Run full validation
./scripts/validate-dev.sh
```

## 🆘 Troubleshooting Manual Steps

### "Database ID not found"

- The setup script shows the database ID when creating it
- Copy that ID and update `wrangler.dev.jsonc`
- Or find it with: `wrangler d1 list --config wrangler.dev.jsonc`

### "AutoRAG API token not set"

- Make sure you ran: `wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc`
- Verify with: `wrangler secret list --config wrangler.dev.jsonc`

### "AutoRAG instance not found"

- Check the Cloudflare dashboard
- Make sure the instance name matches: `loresmith-library-autorag-dev`
- Verify the instance is active and configured

### "CORS errors"

- Make sure both servers are running:
  - Backend: `npm run dev:cloudflare` (port 8787)
  - Frontend: `npm run start` (port 5173)
- Check `.dev.vars` has correct CORS origins

## 📋 Quick Reference

### Essential Commands

```bash
# Setup (run once)
npm run dev:setup

# Development (run daily)
npm run dev:cloudflare  # Terminal 1
npm run start          # Terminal 2

# Validation (run when issues occur)
./scripts/validate-dev.sh

# Secrets (run when needed)
wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc
```

### Key Files to Edit

- `.dev.vars` - Environment variables
- `wrangler.dev.jsonc` - Database ID and account ID
- Cloudflare Dashboard - AutoRAG instance configuration

### Important URLs

- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **AutoRAG Section**: https://dash.cloudflare.com → AI → AutoRAG
- **Workers Section**: https://dash.cloudflare.com → Workers & Pages
- **Local Development**: http://localhost:5173 (frontend), http://localhost:8787 (backend)
