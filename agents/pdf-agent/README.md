# LoreSmith PDF Storage Agent

A2A Protocol agent for storing and managing D&D 5e PDFs for campaign planning. This Cloudflare Worker handles large PDF uploads, stores them securely, and provides **fully authenticated** access to prevent unauthorized usage and costs.

## 🔒 Security Features

- **Full Authentication**: ALL PDF operations require valid API keys
- **Two-tier Authentication**: Separate user and admin keys for different access levels
- **Rate Limiting**: Configurable upload limits per hour/day to prevent abuse
- **File Size Limits**: 50MB maximum per PDF (optimized for D&D content and Worker limits)
- **Audit Trail**: Track who uploaded what and when
- **Zero Public Access**: All content is private and authenticated

## Features

- **PDF Upload & Storage**: Upload large PDFs via multipart/form-data (authenticated)
- **Metadata Management**: Automatic metadata extraction and tagging
- **Secure Storage**: Uses Cloudflare R2 for reliable PDF storage
- **A2A Protocol**: Full A2A protocol compliance with agent discovery
- **RESTful API**: Clean endpoints for all operations
- **CORS Support**: Cross-origin requests supported
- **Cost Control**: Built-in limits and authentication to prevent unauthorized usage

## Setup

### 1. Prerequisites
- Cloudflare account with Workers and R2 enabled
- Node.js and npm installed
- Wrangler CLI installed (`npm install -g wrangler`)

### 2. Create Required Resources

Create an R2 bucket for PDF storage:
```bash
wrangler r2 bucket create loresmith-pdfs
```

Create KV namespaces for metadata and rate limiting:
```bash
wrangler kv:namespace create "PDF_METADATA"
wrangler kv:namespace create "PDF_METADATA" --preview
```

### 3. Set Up Authentication

**Generate secure API keys** (use a password manager or generator):

Set your API keys as secrets (these won't be visible in your code):
```bash
# Set the main API key for uploads
wrangler secret put API_KEY

# Set the admin API key for delete operations  
wrangler secret put ADMIN_API_KEY
```

When prompted, enter strong, unique keys like:
- API_KEY: `lore_upload_abc123def456ghi789jkl012`
- ADMIN_API_KEY: `lore_admin_xyz789uvw456rst123opq890`

### 4. Update Configuration

Update `wrangler.toml` with your actual KV namespace IDs from step 2:
```toml
[[kv_namespaces]]
binding = "PDF_METADATA"
id = "your_actual_kv_namespace_id"
preview_id = "your_actual_preview_kv_namespace_id"
```

### 5. Deploy

```bash
npm install
wrangler deploy
```

## API Endpoints

### Agent Discovery
- **GET** `/.well-known/agent.json` - A2A protocol agent card (public)

### PDF Operations

#### 🔒 **All Endpoints Require Authentication**
- **POST** `/upload` - Upload a PDF file
  - **Authentication**: Required (API_KEY or ADMIN_API_KEY)
  - Content-Type: `multipart/form-data`
  - Fields: `file` (required), `name` (optional), `tags` (optional)
  - Rate Limits: 10/hour, 50/day (configurable)
  - File Size: Up to 50MB per PDF
  
- **GET** `/pdfs` - List all stored PDFs
  - **Authentication**: Required (API_KEY or ADMIN_API_KEY)
  
- **GET** `/pdf/{id}` - Download a specific PDF
  - **Authentication**: Required (API_KEY or ADMIN_API_KEY)
  
- **GET** `/pdf/{id}/metadata` - Get PDF metadata and text preview
  - **Authentication**: Required (API_KEY or ADMIN_API_KEY)
  
- **DELETE** `/pdf/{id}` - Delete a PDF
  - **Authentication**: Required (ADMIN_API_KEY only)

## Usage Examples

### Upload a PDF (with authentication)
```bash
curl -X POST https://your-worker.workers.dev/upload \
  -H "Authorization: Bearer lore_upload_abc123def456ghi789jkl012" \
  -F "file=@/path/to/your/dnd-manual.pdf" \
  -F "name=Player's Handbook" \
  -F "tags=core,rules,player"
```

### List all PDFs (authentication required)
```bash
curl https://your-worker.workers.dev/pdfs \
  -H "Authorization: Bearer lore_upload_abc123def456ghi789jkl012"
```

### Get PDF metadata (authentication required)
```bash
curl https://your-worker.workers.dev/pdf/{pdf-id}/metadata \
  -H "Authorization: Bearer lore_upload_abc123def456ghi789jkl012"
```

### Download a PDF (authentication required)
```bash
curl https://your-worker.workers.dev/pdf/{pdf-id} \
  -H "Authorization: Bearer lore_upload_abc123def456ghi789jkl012" \
  -o downloaded.pdf
```

### Delete a PDF (admin authentication required)
```bash
curl -X DELETE https://your-worker.workers.dev/pdf/{pdf-id} \
  -H "Authorization: Bearer lore_admin_xyz789uvw456rst123opq890"
```

## A2A Integration

This agent is fully compatible with the A2A protocol. Other agents can discover its capabilities:

```javascript
const response = await fetch('https://your-worker.workers.dev/.well-known/agent.json');
const agentCard = await response.json();
console.log(agentCard.authentication); // Shows auth requirements
console.log(agentCard.rate_limits); // Shows current limits

// All PDF operations require authentication
const pdfsResponse = await fetch('https://your-worker.workers.dev/pdfs', {
  headers: {
    'Authorization': 'Bearer your-api-key'
  }
});
```

## Cost Protection Features

### 🛡️ **Built-in Safeguards**
- **File Size Limit**: 10GB maximum per PDF (handles large D&D collections)
- **Rate Limiting**: 10 uploads/hour, 50/day per API key (configurable)
- **Full Authentication**: ALL endpoints require valid API keys
- **Admin-only Deletion**: Prevent accidental data loss

### 💰 **Cost Estimates**
- **R2 Storage**: ~$0.015 per GB per month
- **R2 Operations**: ~$0.0036 per 1000 requests  
- **Worker Requests**: 100,000 free per day
- **KV Operations**: 100,000 reads/day free

**Example**: 100 x 100MB PDFs = ~$0.15/month storage + minimal operation costs

### ⚙️ **Configurable Limits**

Edit `wrangler.toml` to adjust rate limits:
```toml
[vars]
RATE_LIMIT_UPLOADS_PER_HOUR = "5"    # Reduce for tighter control
RATE_LIMIT_UPLOADS_PER_DAY = "25"    # Adjust based on your needs
```

## Development

Run locally:
```bash
npm run dev
```

View logs:
```bash
npm run tail
```

## File Size Guidelines

**50MB limit is perfect for D&D content:**
- **Player's Handbook**: ~40MB (high quality)
- **Monster Manual**: ~45MB
- **Campaign modules**: 5-25MB typically
- **Homebrew content**: Usually under 10MB

**If your PDF is larger:**
- Use PDF compression tools (often reduces size by 50-80%)
- Split large compilations into separate books
- Convert high-resolution scans to optimized PDFs

Test authentication:
```bash
# This should fail (no auth)
curl -X POST http://localhost:8787/upload -F "file=@test.pdf"

# This should also fail (no auth for listing)
curl http://localhost:8787/pdfs

# This should work (with auth)
curl -X POST http://localhost:8787/upload \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@test.pdf"

# This should work (authenticated listing)
curl http://localhost:8787/pdfs \
  -H "Authorization: Bearer your-api-key"
```

## Security Best Practices

1. **Keep API keys secret** - Never commit them to version control
2. **Use different keys** for different environments/users
3. **Rotate keys periodically** using `wrangler secret put`
4. **Monitor usage** via Cloudflare dashboard
5. **Set conservative rate limits** initially, increase as needed
6. **All content is private** - no public access to PDFs whatsoever

## Troubleshooting

### Authentication Errors
- **401 Unauthorized**: Check your Authorization header format: `Bearer your-api-key`
- **Rate limit exceeded**: Wait for the time period or use admin key for higher limits

### Upload Errors  
- **413 File too large**: Compress PDF or split large files (50MB limit)
- **400 Invalid file**: Ensure file is a valid PDF with correct MIME type

## Next Steps

- Enhanced PDF text extraction with proper parsing libraries
- Full-text search capabilities across stored PDFs
- PDF thumbnails generation for quick previews
- OCR for scanned PDFs
- Integration with other D&D planning agents
- User management with individual API keys
- Usage analytics and cost monitoring