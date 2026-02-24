/**
 * File upload security for proposals and campaign resources.
 * Uses OWASP-recommended allowlist approach with magic-byte validation.
 *
 * NOTE: We avoid `file-type` here because its tokenizer stack can pull in
 * Node-only `tty` paths under Worker-based dev runtimes.
 */

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

function hasPrefix(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function includesAscii(bytes: Uint8Array, text: string): boolean {
  const encoder = new TextEncoder();
  const needle = encoder.encode(text);
  if (needle.length === 0 || bytes.length < needle.length) return false;
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function detectMagicType(bytes: Uint8Array, claimedExt: string): string | null {
  // PDF: 25 50 44 46 -> "%PDF"
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";

  // Legacy Word .doc (OLE/CFBF): D0 CF 11 E0 A1 B1 1A E1
  if (hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "doc";
  }

  // ZIP container used by .docx: 50 4B 03 04 / 50 4B 05 06 / 50 4B 07 08
  const isZip =
    hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x07, 0x08]);
  if (isZip) {
    // Stronger signal for DOCX package internals when present in the head bytes.
    if (
      includesAscii(bytes, "word/") ||
      includesAscii(bytes, "[Content_Types].xml")
    ) {
      return "docx";
    }
    // If claimed as docx but internals aren't visible in the first chunk,
    // keep behavior practical for stream/head-only validation.
    if (claimedExt === "docx") return "docx";
    return "zip";
  }

  return null;
}

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

  const detectedExt = detectMagicType(uint8, ext);

  // No magic bytes (txt, md, json, etc.) - allow if extension is in allowlist
  if (!detectedExt) {
    return { valid: true };
  }

  // Detected type must match claimed extension
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
