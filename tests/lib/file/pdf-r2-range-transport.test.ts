import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PROCESSING_LIMITS } from "@/app-constants";
import { MemoryLimitError } from "@/lib/errors";
import { extractPdfPagesRangeFromR2 } from "@/lib/file/pdf-r2-range-transport";

/**
 * Builds a small real PDF so the range transport is exercised against actual
 * PDF bytes rather than a stub. Each page carries distinct text so we can tell
 * which pages were extracted.
 */
async function buildPdf(pageTexts: string[]): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (const text of pageTexts) {
		const page = doc.addPage([300, 200]);
		page.drawText(text, { x: 20, y: 150, size: 14, font });
	}
	return doc.save();
}

/** Records every range request so we can assert the transport really ranged. */
function fakeR2(bytes: Uint8Array) {
	const ranges: Array<{ offset: number; length: number }> = [];
	return {
		ranges,
		bucket: {
			async get(
				_key: string,
				options?: { range?: { offset: number; length: number } }
			) {
				const slice = options?.range
					? bytes.slice(
							options.range.offset,
							options.range.offset + options.range.length
						)
					: bytes;
				if (options?.range) ranges.push(options.range);
				return {
					async arrayBuffer() {
						// Copy into a standalone ArrayBuffer; pdf.js takes ownership.
						return slice.slice().buffer as ArrayBuffer;
					},
				};
			},
		},
	};
}

describe("extractPdfPagesRangeFromR2", () => {
	it("extracts text over range requests without loading the whole file", async () => {
		const bytes = await buildPdf([
			"AlphaPageOne",
			"BravoPageTwo",
			"CharliePageThree",
		]);
		const { bucket, ranges } = fakeR2(bytes);

		const result = await extractPdfPagesRangeFromR2(
			bucket,
			"uploads/sample.pdf",
			bytes.length,
			1,
			2
		);

		expect(result.totalPages).toBe(3);
		expect(result.pagesExtracted).toBe(2);
		expect(result.text).toContain("AlphaPageOne");
		expect(result.text).toContain("BravoPageTwo");
		expect(result.text).not.toContain("CharliePageThree");
		// pdf.js only asks for data once the transportReady handshake settles,
		// so a non-empty range log proves the transport was actually driven.
		expect(ranges.length).toBeGreaterThan(0);
	});

	it("clamps a page range that runs past the end of the document", async () => {
		const bytes = await buildPdf(["OnlyPageHere"]);
		const { bucket } = fakeR2(bytes);

		const result = await extractPdfPagesRangeFromR2(
			bucket,
			"uploads/one-page.pdf",
			bytes.length,
			1,
			99
		);

		expect(result.totalPages).toBe(1);
		expect(result.pagesExtracted).toBe(1);
		expect(result.text).toContain("OnlyPageHere");
	});

	it("rejects files above the range-processing size limit", async () => {
		const { bucket } = fakeR2(new Uint8Array(0));

		await expect(
			extractPdfPagesRangeFromR2(
				bucket,
				"uploads/huge.pdf",
				PROCESSING_LIMITS.MAX_PDF_SIZE_FOR_RANGE_BYTES + 1,
				1,
				1
			)
		).rejects.toBeInstanceOf(MemoryLimitError);
	});
});
