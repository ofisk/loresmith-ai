/**
 * Client-side PDF splitting for upload. Large PDFs are split into parts under
 * maxPartBytes so each part can be indexed (Worker has a 128MB heap; PDF.js
 * allocates a buffer of file size). Uses pdf-lib; runs in the browser.
 */

import { PDFDocument } from "pdf-lib";

export interface PdfPart {
	file: File;
	filename: string;
}

/**
 * Split a PDF file into multiple parts, each under maxPartBytes.
 * Uses page count to approximate equal-sized parts. The full file is loaded
 * into memory (browser), so very large files may hit memory limits.
 *
 * @param file - PDF File from input
 * @param maxPartBytes - Max size per part (e.g. PROCESSING_LIMITS.MAX_PDF_SIZE_FOR_RANGE_BYTES)
 * @returns Array of { file, filename } for each part
 */
export async function splitPdfIntoParts(
	file: File,
	maxPartBytes: number
): Promise<PdfPart[]> {
	const bytes = await file.arrayBuffer();
	const src = await PDFDocument.load(bytes);
	const totalPages = src.getPageCount();
	if (totalPages === 0) {
		throw new Error("PDF has no pages");
	}

	const numParts = Math.max(1, Math.ceil(file.size / maxPartBytes));
	const pagesPerPart = Math.ceil(totalPages / numParts);
	const baseName = file.name.replace(/\.pdf$/i, "").trim() || "document";
	const parts: PdfPart[] = [];

	for (let p = 0; p < numParts; p++) {
		const start = p * pagesPerPart;
		const end = Math.min(start + pagesPerPart, totalPages);
		if (start >= end) continue;

		const indices = Array.from({ length: end - start }, (_, i) => start + i);
		const newDoc = await PDFDocument.create();
		const copiedPages = await newDoc.copyPages(src, indices);
		for (const page of copiedPages) {
			newDoc.addPage(page);
		}

		const partPdfBytes = await newDoc.save();
		const partFilename =
			numParts > 1
				? `${baseName} (part ${p + 1} of ${numParts}).pdf`
				: `${baseName}.pdf`;
		// Copy to a plain Uint8Array so File() gets a BlobPart (ArrayBuffer-backed)
		const copy = new Uint8Array(partPdfBytes.length);
		copy.set(partPdfBytes);
		parts.push({
			file: new File([copy], partFilename, { type: "application/pdf" }),
			filename: partFilename,
		});
	}

	return parts;
}
