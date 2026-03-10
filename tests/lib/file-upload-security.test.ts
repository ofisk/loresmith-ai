import { describe, expect, it } from "vitest";
import {
	ALLOWED_EXTENSIONS,
	getExtension,
	isFileAllowedForProposal,
	validateFileContent,
} from "@/lib/file/file-upload-security";

describe("file-upload-security", () => {
	describe("getExtension", () => {
		it("extracts extension from filename", () => {
			expect(getExtension("document.pdf")).toBe("pdf");
			expect(getExtension("file.DOCX")).toBe("docx");
			expect(getExtension("notes.txt")).toBe("txt");
		});

		it("handles null byte bypass (takes part before null)", () => {
			// Attacker sends "file.pdf\x00.exe" hoping we truncate at null; we take [0] so extension is pdf
			expect(getExtension("malicious.pdf\x00.exe")).toBe("pdf");
		});

		it("handles path traversal", () => {
			expect(getExtension("../../../etc/passwd")).toBe("");
			expect(getExtension("path/to/document.pdf")).toBe("pdf");
		});

		it("handles double extension (takes last)", () => {
			expect(getExtension("file.pdf.exe")).toBe("exe");
			expect(getExtension("document.final.pdf")).toBe("pdf");
		});

		it("returns empty for no extension", () => {
			expect(getExtension("noext")).toBe("");
			expect(getExtension("")).toBe("");
		});
	});

	describe("isExtensionAllowed / isFileAllowedForProposal", () => {
		it("allows supported formats", () => {
			expect(isFileAllowedForProposal("doc.pdf")).toBe(true);
			expect(isFileAllowedForProposal("doc.docx")).toBe(true);
			expect(isFileAllowedForProposal("doc.txt")).toBe(true);
			expect(isFileAllowedForProposal("doc.md")).toBe(true);
			expect(isFileAllowedForProposal("doc.json")).toBe(true);
			expect(isFileAllowedForProposal("mood-board.jpg")).toBe(true);
			expect(isFileAllowedForProposal("city-rain.png")).toBe(true);
			expect(isFileAllowedForProposal("alley.webp")).toBe(true);
		});

		it("rejects executable formats", () => {
			expect(isFileAllowedForProposal("script.exe")).toBe(false);
			expect(isFileAllowedForProposal("run.sh")).toBe(false);
			expect(isFileAllowedForProposal("malware.bat")).toBe(false);
		});

		it("rejects empty or unknown extension", () => {
			expect(isFileAllowedForProposal("noext")).toBe(false);
		});
	});

	describe("validateFileContent", () => {
		it("validates PDF magic bytes", async () => {
			// PDF magic: %PDF-
			const pdfHeader = new Uint8Array([
				0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
			]);
			const result = await validateFileContent(pdfHeader, "pdf");
			expect(result.valid).toBe(true);
		});

		it("rejects content mismatch (claimed ext vs actual)", async () => {
			const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
			const result = await validateFileContent(pdfHeader, "txt");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("does not match");
		});

		it("allows txt/md when file-type returns undefined (no magic bytes)", async () => {
			const textContent = new TextEncoder().encode("Plain text content");
			const result = await validateFileContent(textContent, "txt");
			expect(result.valid).toBe(true);
		});

		it("rejects disallowed extension even with valid content", async () => {
			const result = await validateFileContent(
				new Uint8Array([0x25, 0x50, 0x44, 0x46]),
				"exe"
			);
			expect(result.valid).toBe(false);
		});

		it("validates PNG magic bytes", async () => {
			const pngHeader = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
			]);
			const result = await validateFileContent(pngHeader, "png");
			expect(result.valid).toBe(true);
		});

		it("validates JPEG magic bytes with jpg extension alias", async () => {
			const jpgHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
			const result = await validateFileContent(jpgHeader, "jpg");
			expect(result.valid).toBe(true);
		});
	});

	describe("ALLOWED_EXTENSIONS", () => {
		it("includes expected formats", () => {
			expect(ALLOWED_EXTENSIONS.has("pdf")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("docx")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("txt")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("md")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("jpg")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("png")).toBe(true);
			expect(ALLOWED_EXTENSIONS.has("webp")).toBe(true);
		});
	});
});
