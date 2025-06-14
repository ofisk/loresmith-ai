import { UPLOAD_UI_HTML } from './pdf-agent-ui.js';

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    // A2A Protocol agent card endpoint
    if (pathname === "/.well-known/agent.json") {
      return new Response(JSON.stringify({
        "@type": "AgentCard",
        "name": "LoreSmith PDF Storage Agent",
        "description": "Stores and manages D&D 5e PDFs for campaign planning. Handles large PDF uploads up to 200MB, extracts metadata, and provides retrieval endpoints.",
        "version": "1.0.0",
        "capabilities": [
          "pdf-upload",
          "pdf-storage", 
          "pdf-retrieval",
          "metadata-extraction",
          "text-extraction",
          "large-file-support"
        ],
        "api": {
          "url": "https://loresmith.example.workers.dev",
          "authentication": {
            "type": "api-key",
            "header": "Authorization",
            "format": "Bearer {api-key}",
            "required_for": ["all_endpoints"]
          },
          "rate_limits": {
            "uploads_per_hour": 10,
            "uploads_per_day": 50
          },
          "file_limits": {
            "max_size": "200MB",
            "supported_types": ["application/pdf"]
          },
          "endpoints": [
            {
              "path": "/upload/request",
              "method": "POST",
              "description": "Request a presigned upload URL for large PDFs",
              "accepts": "application/json",
              "authentication": "required",
              "parameters": {
                "filename": "Original filename",
                "size": "File size in bytes",
                "name": "Optional custom name for the PDF",
                "tags": "Optional comma-separated tags"
              }
            },
            {
              "path": "/upload/complete",
              "method": "POST",
              "description": "Complete the upload process after direct R2 upload",
              "accepts": "application/json",
              "authentication": "required",
              "parameters": {
                "upload_id": "Upload ID from request step",
                "etag": "ETag returned from R2 upload"
              }
            },
            {
              "path": "/upload",
              "method": "POST",
              "description": "Upload a PDF file (legacy method, <100MB only)",
              "accepts": "multipart/form-data",
              "authentication": "required",
              "parameters": {
                "file": "PDF file to upload",
                "name": "Optional custom name for the PDF",
                "tags": "Optional comma-separated tags"
              }
            },
            {
              "path": "/pdfs",
              "method": "GET", 
              "description": "List all stored PDFs",
              "authentication": "required"
            },
            {
              "path": "/pdf/{id}",
              "method": "GET",
              "description": "Download a specific PDF",
              "authentication": "required"
            },
            {
              "path": "/pdf/{id}/metadata",
              "method": "GET",
              "description": "Get PDF metadata and extracted text preview",
              "authentication": "required"
            },
            {
              "path": "/pdf/{id}",
              "method": "DELETE",
              "description": "Delete a PDF",
              "authentication": "required"
            }
          ]
        }
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // API-only agent - no UI served directly

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    // Request presigned upload URL - REQUIRES AUTHENTICATION
    if (pathname === "/upload/request" && req.method === "POST") {
      // Check authentication
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;
      const authResult = authResponse.success;

      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(req, env, authResult.clientId);
      if (!rateLimitResult.success) {
        return new Response(JSON.stringify({
          error: "Rate limit exceeded",
          message: rateLimitResult.message,
          limits: {
            uploads_per_hour: parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10"),
            uploads_per_day: parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50")
          },
          retry_after: rateLimitResult.retryAfter
        }), { 
          status: 429,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Retry-After": rateLimitResult.retryAfter?.toString() || "3600"
          }
        });
      }

      try {
        const body = await req.json();
        const { filename, size, name, tags } = body;

        if (!filename || !size) {
          return new Response(JSON.stringify({
            error: "Missing required fields: filename and size"
          }), { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Check file size (limit to 200MB)
        const maxSize = 200 * 1024 * 1024; // 200MB
        if (size > maxSize) {
          return new Response(JSON.stringify({
            error: "File too large",
            message: `PDF must be smaller than ${maxSize / (1024 * 1024)}MB`,
            size: size
          }), { 
            status: 413,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Generate unique ID for the PDF
        const uploadId = crypto.randomUUID();
        const pdfKey = `pdfs/${uploadId}.pdf`;
        
        // Generate presigned URL for R2 upload
        const presignedUrl = await env.loresmith_pdfs.createPresignedUrl(pdfKey, {
          method: "PUT",
          expiresIn: 3600, // 1 hour
          httpMetadata: {
            contentType: "application/pdf"
          }
        });

        // Store pending upload metadata
        const pendingMetadata = {
          uploadId: uploadId,
          originalName: name || filename,
          filename: filename,
          size: size,
          tags: tags ? tags.split(",").map(t => t.trim()) : [],
          uploadedBy: authResult.clientId,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
        };

        await env.PDF_METADATA.put(`pending:${uploadId}`, JSON.stringify(pendingMetadata), {
          expirationTtl: 3600 // 1 hour
        });

        // Update rate limit counters
        await this.updateRateLimit(env, authResult.clientId);

        return new Response(JSON.stringify({
          success: true,
          upload_id: uploadId,
          presigned_url: presignedUrl,
          expires_in: 3600,
          instructions: {
            method: "PUT",
            headers: {
              "Content-Type": "application/pdf"
            },
            note: "Upload the file directly to the presigned URL, then call /upload/complete"
          }
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to create upload request",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Complete presigned upload - REQUIRES AUTHENTICATION
    if (pathname === "/upload/complete" && req.method === "POST") {
      // Check authentication
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;
      const authResult = authResponse.success;

      try {
        const body = await req.json();
        const { upload_id, etag } = body;

        if (!upload_id) {
          return new Response(JSON.stringify({
            error: "Missing required field: upload_id"
          }), { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Get pending upload metadata
        const pendingData = await env.PDF_METADATA.get(`pending:${upload_id}`);
        if (!pendingData) {
          return new Response(JSON.stringify({
            error: "Upload not found or expired"
          }), { 
            status: 404,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        const pendingMetadata = JSON.parse(pendingData);

        // Verify the upload belongs to the authenticated user
        if (pendingMetadata.uploadedBy !== authResult.clientId) {
          return new Response(JSON.stringify({
            error: "Unauthorized to complete this upload"
          }), { 
            status: 403,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Verify the file exists in R2
        const pdfKey = `pdfs/${upload_id}.pdf`;
        const pdfObject = await env.loresmith_pdfs.head(pdfKey);
        if (!pdfObject) {
          return new Response(JSON.stringify({
            error: "File not found in storage. Please retry the upload."
          }), { 
            status: 404,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Create final metadata
        const metadata = {
          id: upload_id,
          originalName: pendingMetadata.originalName,
          uploadDate: new Date().toISOString(),
          size: pdfObject.size,
          tags: pendingMetadata.tags,
          textPreview: "Large PDF - text extraction pending",
          contentType: "application/pdf",
          uploadedBy: authResult.clientId,
          etag: etag
        };

        // Store final metadata
        await env.PDF_METADATA.put(`pdf:${upload_id}`, JSON.stringify(metadata));

        // Clean up pending metadata
        await env.PDF_METADATA.delete(`pending:${upload_id}`);

        return new Response(JSON.stringify({
          success: true,
          pdf_id: upload_id,
          message: "PDF upload completed successfully",
          metadata: metadata
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to complete upload",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Legacy Upload PDF endpoint (for files <100MB) - REQUIRES AUTHENTICATION
    if (pathname === "/upload" && req.method === "POST") {
      // Check authentication
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;
      const authResult = authResponse.success;

      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(req, env, authResult.clientId);
      if (!rateLimitResult.success) {
        return new Response(JSON.stringify({
          error: "Rate limit exceeded",
          message: rateLimitResult.message,
          limits: {
            uploads_per_hour: parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10"),
            uploads_per_day: parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50")
          },
          retry_after: rateLimitResult.retryAfter
        }), { 
          status: 429,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Retry-After": rateLimitResult.retryAfter?.toString() || "3600"
          }
        });
      }

      try {
        const formData = await req.formData();
        const file = formData.get("file");
        const customName = formData.get("name");
        const tags = formData.get("tags");

        if (!file || file.type !== "application/pdf") {
          return new Response(JSON.stringify({
            error: "Please upload a valid PDF file"
          }), { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Check file size (limit to 95MB for legacy uploads to stay under Worker limit)
        const maxSize = 95 * 1024 * 1024; // 95MB
        if (file.size > maxSize) {
          return new Response(JSON.stringify({
            error: "File too large for direct upload",
            message: `Files larger than ${maxSize / (1024 * 1024)}MB must use the presigned upload method. Use /upload/request instead.`,
            size: file.size,
            recommendation: "Use /upload/request endpoint for files up to 200MB"
          }), { 
            status: 413,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // Generate unique ID for the PDF
        const pdfId = crypto.randomUUID();
        const fileName = customName || file.name || `pdf_${pdfId}.pdf`;
        
        // Store PDF in R2
        const pdfKey = `pdfs/${pdfId}.pdf`;
        await env.loresmith_pdfs.put(pdfKey, file.stream(), {
          httpMetadata: {
            contentType: "application/pdf",
            contentDisposition: `attachment; filename="${fileName}"`
          }
        });

        // Extract basic text content (first few KB for preview)
        const pdfBuffer = await file.arrayBuffer();
        const textPreview = await this.extractTextPreview(pdfBuffer);

        // Store metadata in KV
        const metadata = {
          id: pdfId,
          originalName: fileName,
          uploadDate: new Date().toISOString(),
          size: file.size,
          tags: tags ? tags.split(",").map(t => t.trim()) : [],
          textPreview: textPreview,
          contentType: "application/pdf",
          uploadedBy: authResult.clientId
        };

        await env.PDF_METADATA.put(`pdf:${pdfId}`, JSON.stringify(metadata));

        // Update rate limit counters
        await this.updateRateLimit(env, authResult.clientId);

        return new Response(JSON.stringify({
          success: true,
          pdfId: pdfId,
          message: "PDF uploaded successfully",
          metadata: metadata
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to upload PDF",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // List all PDFs - REQUIRES AUTHENTICATION
    if (pathname === "/pdfs" && req.method === "GET") {
      // Check authentication
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;

      try {
        const { keys } = await env.PDF_METADATA.list({ prefix: "pdf:" });
        const pdfs = [];

        for (const key of keys) {
          const metadata = await env.PDF_METADATA.get(key.name);
          if (metadata) {
            const pdfData = JSON.parse(metadata);
            // Remove sensitive info for listing
            delete pdfData.uploadedBy;
            pdfs.push(pdfData);
          }
        }

        return new Response(JSON.stringify({
          pdfs: pdfs,
          count: pdfs.length
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to list PDFs",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Get specific PDF - REQUIRES AUTHENTICATION
    if (pathname.startsWith("/pdf/") && req.method === "GET") {
      // Check authentication
      const authResponse = await this.requireAuthentication(req, env);
      if (authResponse.error) return authResponse.error;

      const pathParts = pathname.split("/");
      const pdfId = pathParts[2];
      const action = pathParts[3]; // Could be 'metadata'

      if (action === "metadata") {
        // Return metadata only
        try {
          const metadata = await env.PDF_METADATA.get(`pdf:${pdfId}`);
          if (!metadata) {
            return new Response(JSON.stringify({
              error: "PDF not found"
            }), { 
              status: 404,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          const pdfData = JSON.parse(metadata);
          // Remove sensitive info
          delete pdfData.uploadedBy;

          return new Response(JSON.stringify(pdfData), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });

        } catch (error) {
          return new Response(JSON.stringify({
            error: "Failed to get PDF metadata",
            details: error.message
          }), { 
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      } else {
        // Return the PDF file
        try {
          const pdfKey = `pdfs/${pdfId}.pdf`;
          const pdfObject = await env.loresmith_pdfs.get(pdfKey);
          
          if (!pdfObject) {
            return new Response(JSON.stringify({
              error: "PDF not found"
            }), { 
              status: 404,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          return new Response(pdfObject.body, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": pdfObject.httpMetadata?.contentDisposition || "attachment",
              "Access-Control-Allow-Origin": "*"
            }
          });

        } catch (error) {
          return new Response(JSON.stringify({
            error: "Failed to retrieve PDF",
            details: error.message
          }), { 
            status: 500,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
    }

    // Delete PDF - REQUIRES ADMIN AUTHENTICATION  
    if (pathname.startsWith("/pdf/") && req.method === "DELETE") {
      // Check admin authentication
      const authResponse = await this.requireAuthentication(req, env, true);
      if (authResponse.error) return authResponse.error;

      const pdfId = pathname.split("/")[2];
      
      try {
        // Delete from R2
        const pdfKey = `pdfs/${pdfId}.pdf`;
        await env.loresmith_pdfs.delete(pdfKey);
        
        // Delete metadata from KV
        await env.PDF_METADATA.delete(`pdf:${pdfId}`);

        return new Response(JSON.stringify({
          success: true,
          message: "PDF deleted successfully"
        }), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: "Failed to delete PDF",
          details: error.message
        }), { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Default response
    return new Response("LoreSmith PDF Storage Agent Ready\n\nEndpoints:\n- GET /.well-known/agent.json - Agent capabilities\n- POST /upload/request - Request presigned upload URL (up to 200MB)\n- POST /upload/complete - Complete presigned upload\n- POST /upload - Upload PDF directly (<95MB)\n- GET /pdfs - List PDFs (AUTH REQUIRED)\n- GET /pdf/{id} - Download PDF (AUTH REQUIRED)\n- GET /pdf/{id}/metadata - Get PDF metadata (AUTH REQUIRED)\n- DELETE /pdf/{id} - Delete PDF (ADMIN AUTH REQUIRED)\n\nAuthentication: Bearer token in Authorization header", {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },

  // Helper function to require authentication and return appropriate responses
  async requireAuthentication(req, env, adminRequired = false) {
    const authResult = await this.checkAuthentication(req, env, adminRequired);
    
    if (!authResult.success) {
      const errorMessage = adminRequired 
        ? "Delete operations require admin authentication"
        : "Please provide a valid API key in the Authorization header";
        
      return {
        error: new Response(JSON.stringify({
          error: "Authentication required",
          message: errorMessage,
          format: "Authorization: Bearer your-api-key"
        }), { 
          status: 401,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "WWW-Authenticate": "Bearer"
          }
        })
      };
    }

    return { success: authResult };
  },

  // Authentication check
  async checkAuthentication(req, env, adminRequired = false) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { success: false, error: "Missing or invalid Authorization header" };
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    
    // Check against API keys
    const validApiKey = env.API_KEY;
    const validAdminKey = env.ADMIN_API_KEY;

    if (adminRequired) {
      if (token === validAdminKey) {
        return { success: true, clientId: "admin", isAdmin: true };
      }
      return { success: false, error: "Admin authentication required" };
    }

    if (token === validApiKey || token === validAdminKey) {
      return { 
        success: true, 
        clientId: token === validAdminKey ? "admin" : "user",
        isAdmin: token === validAdminKey
      };
    }

    return { success: false, error: "Invalid API key" };
  },

  // Rate limiting
  async checkRateLimit(req, env, clientId) {
    const now = Date.now();
    const hourKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60))}`;
    const dayKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60 * 24))}`;
    
    const hourlyLimit = parseInt(env.RATE_LIMIT_UPLOADS_PER_HOUR || "10");
    const dailyLimit = parseInt(env.RATE_LIMIT_UPLOADS_PER_DAY || "50");

    try {
      const [hourlyCount, dailyCount] = await Promise.all([
        env.PDF_METADATA.get(hourKey),
        env.PDF_METADATA.get(dayKey)
      ]);

      const currentHourly = parseInt(hourlyCount || "0");
      const currentDaily = parseInt(dailyCount || "0");

      if (currentHourly >= hourlyLimit) {
        return { 
          success: false, 
          message: `Hourly upload limit of ${hourlyLimit} exceeded`,
          retryAfter: 3600 // 1 hour
        };
      }

      if (currentDaily >= dailyLimit) {
        return { 
          success: false, 
          message: `Daily upload limit of ${dailyLimit} exceeded`,
          retryAfter: 86400 // 24 hours
        };
      }

      return { success: true };
    } catch (error) {
      // If rate limiting fails, allow the request but log it
      console.error("Rate limiting check failed:", error);
      return { success: true };
    }
  },

  // Update rate limit counters
  async updateRateLimit(env, clientId) {
    const now = Date.now();
    const hourKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60))}`;
    const dayKey = `ratelimit:${clientId}:${Math.floor(now / (1000 * 60 * 60 * 24))}`;

    try {
      const [hourlyCount, dailyCount] = await Promise.all([
        env.PDF_METADATA.get(hourKey),
        env.PDF_METADATA.get(dayKey)
      ]);

      await Promise.all([
        env.PDF_METADATA.put(hourKey, (parseInt(hourlyCount || "0") + 1).toString(), { expirationTtl: 3600 }),
        env.PDF_METADATA.put(dayKey, (parseInt(dailyCount || "0") + 1).toString(), { expirationTtl: 86400 })
      ]);
    } catch (error) {
      console.error("Failed to update rate limits:", error);
    }
  },

  // Simple text extraction for preview (basic implementation)
  async extractTextPreview(pdfBuffer) {
    try {
      // This is a very basic implementation - in production you'd want to use a proper PDF parser
      // For now, we'll just return a placeholder since PDF text extraction requires additional libraries
      const uint8Array = new Uint8Array(pdfBuffer);
      const text = new TextDecoder().decode(uint8Array.slice(0, 1000));
      
      // Extract any readable text (very basic)
      const readableText = text.replace(/[^\x20-\x7E]/g, '').trim();
      return readableText.length > 10 ? readableText.substring(0, 200) + "..." : "PDF content detected but text extraction requires additional processing";
      
    } catch (error) {
      return "Text extraction failed - PDF uploaded successfully";
    }
  },

  // Load and serve the upload UI HTML from template
  getUploadUI() {
    return UPLOAD_UI_HTML;
  }
};
  