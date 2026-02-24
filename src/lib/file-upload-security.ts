/**
 * File upload security for proposals and campaign resources.
 * Uses OWASP-recommended allowlist approach with magic-byte validation.
 */

import { fileTypeFromBuffer } from "file-type";

/** Extensions allowed for proposals and campaign resources (entity extraction supported types) */
export const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
  "mdx",
  "json",
]);

/** Minimum bytes to read for magic-byte detection (file-type needs ~4KB for some formats) */
const MAGIC_BYTES_LENGTH = 4100;

/**
 * Safely extract extension from filename (OWASP bypass protection).
 * Handles: null bytes, double extensions, path traversal.
 */
export function getExtension(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "";
  // Strip null bytes and take first part
  const withoutNull = fileName.split("\0")[0];
  // Strip path (handle both / and \)
  const basename = withoutNull.replace(/^.*[/\\]/, "").trim();
  const lastDot = basename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === basename.length - 1) return "";
  return basename.slice(lastDot + 1).toLowerCase();
}

/** Check if extension is in the allowlist */
export function isExtensionAllowed(extension: string): boolean {
  if (!extension) return false;
  return ALLOWED_EXTENSIONS.has(extension.toLowerCase());
}

/** Check if a file is allowed by its filename (extension must be in allowlist) */
export function isFileAllowedForProposal(fileName: string): boolean {
  return isExtensionAllowed(getExtension(fileName));
}

/** Human-readable list of allowed types for error messages */
export function getAllowedExtensionsDescription(): string {
  return Array.from(ALLOWED_EXTENSIONS).sort().join(", ");
}

export interface FileContentValidationResult {
  valid: boolean;
  error?: string;
  detectedExt?: string;
}

/**
 * Validate file content against claimed extension using magic-byte detection.
 * For formats without magic bytes (e.g. txt, md), falls back to extension-only check.
 */
export async function validateFileContent(
  buffer: ArrayBuffer | Uint8Array,
  claimedExtension: string
): Promise<FileContentValidationResult> {
  const ext = claimedExtension.toLowerCase();
  if (!isExtensionAllowed(ext)) {
    return {
      valid: false,
      error: `Extension "${ext}" is not allowed. Allowed: ${getAllowedExtensionsDescription()}`,
    };
  }

  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (uint8.length === 0) {
    return { valid: false, error: "Empty file" };
  }

  const detected = await fileTypeFromBuffer(uint8);

  // No magic bytes (txt, md, json, etc.) - allow if extension is in allowlist
  if (!detected) {
    return { valid: true };
  }

  // Detected type must match claimed extension
  const detectedExt = detected.ext.toLowerCase();
  const extAliases: Record<string, string[]> = {
    jpeg: ["jpg", "jpeg"],
    mpeg: ["mpg", "mpeg"],
  };
  const allowedClaimed = [detectedExt, ...(extAliases[detectedExt] ?? [])];
  if (!allowedClaimed.includes(ext)) {
    return {
      valid: false,
      error: `File content (${detectedExt}) does not match extension (${ext})`,
      detectedExt: detectedExt,
    };
  }

  // Detected type must be in our allowlist
  if (!isExtensionAllowed(detectedExt)) {
    return {
      valid: false,
      error: `Detected type "${detectedExt}" is not allowed. Allowed: ${getAllowedExtensionsDescription()}`,
      detectedExt: detectedExt,
    };
  }

  return { valid: true, detectedExt };
}

/** Read leading bytes from a stream (consumes the stream) */
async function readStreamHead(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) break;
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const toCopy = Math.min(chunk.length, result.length - offset);
    result.set(chunk.subarray(0, toCopy), offset);
    offset += toCopy;
    if (offset >= result.length) break;
  }
  return result;
}

/**
 * Validate file from R2 without consuming the body.
 * Uses stream.tee() so the response can be served after validation.
 */
export async function validateR2ObjectAndGetStream(
  r2Object: { body: ReadableStream<Uint8Array>; size: number },
  claimedExtension: string
): Promise<
  { valid: true; stream: ReadableStream } | { valid: false; error: string }
> {
  const [validationStream, responseStream] = r2Object.body.tee();
  const head = await readStreamHead(
    validationStream,
    Math.min(MAGIC_BYTES_LENGTH, r2Object.size || MAGIC_BYTES_LENGTH)
  );
  const result = await validateFileContent(head, claimedExtension);
  if (!result.valid) {
    return { valid: false, error: result.error! };
  }
  return { valid: true, stream: responseStream };
}
