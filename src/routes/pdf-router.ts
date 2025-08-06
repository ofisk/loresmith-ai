// PDF router for organizing PDF-related routes
import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import { requireUserJwt } from "../middleware/auth";
import {
  handleAutoGeneratePdfMetadata,
  handleCompleteUpload,
  handleGenerateUploadUrl,
  handleGetPdfFiles,
  handleGetPdfStats,
  handleGetPdfStatus,
  handleIngestPdf,
  handleProcessMetadataBackground,
  handleUpdatePdfMetadata,
  handleUploadPart,
} from "./pdf";

const pdfRouter = new Hono<{ Bindings: Env }>();

// Apply authentication middleware to all routes
pdfRouter.use("*", requireUserJwt);

// Upload routes
pdfRouter.post("/upload-url", handleGenerateUploadUrl);
pdfRouter.post("/upload-part", handleUploadPart);
pdfRouter.put("/upload/*", handleCompleteUpload);

// File management routes
pdfRouter.post("/ingest", handleIngestPdf);
pdfRouter.get("/files", handleGetPdfFiles);
pdfRouter.get("/status/*", handleGetPdfStatus);
pdfRouter.post("/update-metadata", handleUpdatePdfMetadata);
pdfRouter.post("/auto-generate-metadata", handleAutoGeneratePdfMetadata);
pdfRouter.post("/process-metadata-background", handleProcessMetadataBackground);
pdfRouter.get("/stats", handleGetPdfStats);

export { pdfRouter };
