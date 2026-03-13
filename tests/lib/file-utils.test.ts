import { describe, expect, it } from "vitest";
import {
	appendNumberToDisplayName,
	appendNumberToFilename,
	buildLibraryFileKey,
	buildStagingFileKey,
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

	describe("buildStagingFileKey", () => {
		it("builds key with normal filename", () => {
			expect(buildStagingFileKey("user1", "doc.pdf")).toBe(
				"staging/user1/doc.pdf"
			);
		});

		it("strips path to basename", () => {
			expect(buildStagingFileKey("user1", "folder/doc.pdf")).toBe(
				"staging/user1/doc.pdf"
			);
			expect(buildStagingFileKey("user1", "a\\b\\file.pdf")).toBe(
				"staging/user1/file.pdf"
			);
		});

		it("throws on path traversal", () => {
			expect(() => buildStagingFileKey("user1", "../../../etc/passwd")).toThrow(
				"Invalid filename for storage"
			);
			expect(() => buildStagingFileKey("user1", "folder/../evil.pdf")).toThrow(
				"Invalid filename for storage"
			);
		});

		it("throws on empty filename", () => {
			expect(() => buildStagingFileKey("user1", "")).toThrow(
				"Invalid filename for storage"
			);
		});
	});

	describe("buildLibraryFileKey", () => {
		it("builds key with normal filename", async () => {
			const key = await buildLibraryFileKey("user1", "doc.pdf");
			expect(key).toMatch(/^library\/user1\/[a-f0-9]{16}\/doc\.pdf$/);
		});

		it("strips path to basename", async () => {
			const key = await buildLibraryFileKey("user1", "folder/doc.pdf");
			expect(key).toMatch(/^library\/user1\/[a-f0-9]{16}\/doc\.pdf$/);
		});

		it("throws on path traversal", async () => {
			await expect(
				buildLibraryFileKey("user1", "../../../etc/passwd")
			).rejects.toThrow("Invalid filename for storage");
		});

		it("throws on empty filename", async () => {
			await expect(buildLibraryFileKey("user1", "")).rejects.toThrow(
				"Invalid filename for storage"
			);
		});
	});
});
