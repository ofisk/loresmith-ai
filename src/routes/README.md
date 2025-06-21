# Routes Directory

This directory contains all route modules for the application, organized by feature domain.

## Structure

```
src/routes/
├── pdf-routes.ts     # PDF upload and management endpoints
└── README.md         # This file
```

## Organization

### PDF Routes (`pdf-routes.ts`)
Contains all PDF-related endpoints:

#### Upload Endpoints
- `POST /api/upload-pdf` - FormData upload for large files
- `POST /api/generate-upload-url` - Generate presigned URLs
- `POST /api/upload-pdf-direct` - Base64 upload for small files
- `POST /api/confirm-upload` - Confirm upload completion

#### Management Endpoints
- `GET /api/pdfs` - List PDFs with filtering
- `GET /api/pdfs/:id` - Get specific PDF metadata
- `PUT /api/pdfs/:id` - Update PDF metadata
- `DELETE /api/pdfs/:id` - Delete PDF (with optional file deletion)
- `GET /api/pdfs/search/:query` - Search PDFs
- `GET /api/pdfs/tag/:tag` - Get PDFs by tag
- `GET /api/pdfs/stats` - Get storage statistics

## Usage

Routes are mounted in the main server:

```typescript
// In server.ts
import { pdfRoutes } from "./routes/pdf-routes";

// Mount routes
app.route("/", pdfRoutes);
```

## Adding New Routes

1. Create a new route file: `feature-routes.ts`
2. Export the routes from the file
3. Import and mount the routes directly in `server.ts`

Example:
```typescript
// feature-routes.ts
export const featureRoutes = new Hono<{ Bindings: Env }>();

featureRoutes.get("/api/feature", async (c) => {
  // Route implementation
});

// server.ts
import { featureRoutes } from "./routes/feature-routes";
app.route("/", featureRoutes);
```

## Benefits

- **Separation of Concerns**: Each feature has its own route module
- **Maintainability**: Easy to find and modify specific functionality
- **Scalability**: Simple to add new route modules
- **Testing**: Routes can be tested independently
- **Documentation**: Clear organization makes code self-documenting
- **Simplicity**: Direct imports without unnecessary abstraction layers 