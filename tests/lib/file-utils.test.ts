import { describe, expect, it, vi } from "vitest";
import {
	appendNumberToDisplayName,
	appendNumberToFilename,
	buildLibraryFileKey,
	buildStagingFileKey,
	getFileTypeFromName,
	getUniqueDisplayName,
	getUniqueFilename,
} from "@/lib/file/file-utils";

describe("file-utils", () => {
	describe("getFileTypeFromName", () => {
		it("returns file for empty string", () => {
			expect(getFileTypeFromName("")).toBe("file");
		});

		it.each([
			["doc.pdf", "PDF"],
			["path/to/doc.PDF", "PDF"],
			["file.doc", "Document"],
			["file.docx", "Document"],
			["photo.jpg", "Image"],
			["photo.png", "Image"],
			["file.xyz", "File"],
		])("returns %s for %s", (fileName, expected) => {
			expect(getFileTypeFromName(fileName)).toBe(expected);
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

		it("handles number 0", () => {
			expect(appendNumberToFilename("file.pdf", 0)).toBe("file (0).pdf");
		});

		it("handles leading-dot filenames (treats leading dot as extension start)", () => {
			// lastIndexOf(".") = 0, so name = "" and extension = ".gitignore"
			expect(appendNumberToFilename(".gitignore", 1)).toBe(" (1).gitignore");
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

		it("falls back to timestamp when exceeding 1000 collisions", async () => {
			const checkExists = vi.fn().mockResolvedValue(true);

			const result = await getUniqueFilename(checkExists, "doc.pdf", "user1");

			expect(result).toMatch(/^doc_\d+\.pdf$/);
			expect(checkExists).toHaveBeenCalledTimes(1001);
		});
	});

	describe("getUniqueDisplayName", () => {
		it("returns original when not exists", async () => {
			const checkExists = async () => false;
			const result = await getUniqueDisplayName(
				checkExists,
				"My Document",
				"user1"
			);
			expect(result).toBe("My Document");
		});

		it("appends number when exists", async () => {
			const checkExists = async (_: string, name: string) =>
				name === "My Document";
			const result = await getUniqueDisplayName(
				checkExists,
				"My Document",
				"user1"
			);
			expect(result).toBe("My Document (1)");
		});

		it("returns original when originalDisplayName is empty", async () => {
			const checkExists = vi.fn();
			const result = await getUniqueDisplayName(checkExists, "", "user1");
			expect(result).toBe("");
			expect(checkExists).not.toHaveBeenCalled();
		});

		it("uses excludeFileKey when provided", async () => {
			const checkExists = vi
				.fn()
				.mockImplementation(
					async (_: string, name: string, excludeFileKey?: string) => {
						if (excludeFileKey === "file-123" && name === "My Doc") {
							return false;
						}
						return name === "My Doc";
					}
				);
			const result = await getUniqueDisplayName(
				checkExists,
				"My Doc",
				"user1",
				"file-123"
			);
			expect(result).toBe("My Doc");
			expect(checkExists).toHaveBeenCalledWith("user1", "My Doc", "file-123");
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
