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
  handleProcessPdf,
  handleProcessMetadataBackground,
  handleUpdatePdfMetadata,
  handleUploadPart,
} from "./pdf";

const pdfRouter = new Hono<{ Bindings: Env }>();

// Apply authentication middleware to all routes
pdfRouter.use("*", requireUserJwt);

// Upload routes
pdfRouter.post("/upload-url", handleGenerateUploadUrl);
pdfRouter.post("/upload/complete/*", handleCompleteUpload);
pdfRouter.post("/upload/part", handleUploadPart);

// File management routes
pdfRouter.post("/process", handleProcessPdf);
pdfRouter.get("/files", handleGetPdfFiles);
pdfRouter.get("/status/*", handleGetPdfStatus);
pdfRouter.post("/update-metadata", handleUpdatePdfMetadata);
pdfRouter.post("/auto-generate-metadata", handleAutoGeneratePdfMetadata);
pdfRouter.post("/process-metadata-background", handleProcessMetadataBackground);

// Stats route
pdfRouter.get("/stats", handleGetPdfStats);

export { pdfRouter };
