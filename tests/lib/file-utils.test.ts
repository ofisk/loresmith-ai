import { describe, expect, it } from "vitest";
import {
	appendNumberToDisplayName,
	appendNumberToFilename,
	getFileTypeFromName,
	getUniqueFilename,
} from "@/lib/file/file-utils";

describe("file-utils", () => {
	describe("getFileTypeFromName", () => {
		it("returns file for empty string", () => {
			expect(getFileTypeFromName("")).toBe("file");
		});

		it("returns PDF for .pdf", () => {
			expect(getFileTypeFromName("doc.pdf")).toBe("PDF");
			expect(getFileTypeFromName("path/to/doc.PDF")).toBe("PDF");
		});

		it("returns Document for .doc and .docx", () => {
			expect(getFileTypeFromName("file.doc")).toBe("Document");
			expect(getFileTypeFromName("file.docx")).toBe("Document");
		});

		it("returns Image for image extensions", () => {
			expect(getFileTypeFromName("photo.jpg")).toBe("Image");
			expect(getFileTypeFromName("photo.png")).toBe("Image");
		});

		it("returns File for unknown extension", () => {
			expect(getFileTypeFromName("file.xyz")).toBe("File");
		});
	});

	describe("appendNumberToFilename", () => {
		it("appends number before extension", () => {
			expect(appendNumberToFilename("file.pdf", 1)).toBe("file (1).pdf");
		});

		it("handles filename without extension", () => {
			expect(appendNumberToFilename("readme", 2)).toBe("readme (2)");
		});

		it("handles multiple dots in filename", () => {
			expect(appendNumberToFilename("file.name.pdf", 1)).toBe(
				"file.name (1).pdf"
			);
		});
	});

	describe("appendNumberToDisplayName", () => {
		it("appends number to display name", () => {
			expect(appendNumberToDisplayName("My File", 1)).toBe("My File (1)");
		});
	});

	describe("getUniqueFilename", () => {
		it("returns original when not exists", async () => {
			const checkExists = async () => false;
			const result = await getUniqueFilename(checkExists, "doc.pdf", "user1");
			expect(result).toBe("doc.pdf");
		});

		it("appends number when exists", async () => {
			const checkExists = async (_: string, name: string) => name === "doc.pdf";
			const result = await getUniqueFilename(checkExists, "doc.pdf", "user1");
			expect(result).toBe("doc (1).pdf");
		});

		it("increments until unique", async () => {
			const existing = new Set(["doc.pdf", "doc (1).pdf"]);
			const checkExists = async (_: string, name: string) => existing.has(name);
			const result = await getUniqueFilename(checkExists, "doc.pdf", "user1");
			expect(result).toBe("doc (2).pdf");
		});
	});
});
