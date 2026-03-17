/**
 * R2-backed range transport for PDF.js.
 * Allows loading a PDF from R2 by fetching only the byte ranges requested by PDF.js,
 * so large PDFs can be processed without loading the full file into Worker memory.
 *
 * PDF.js allocates a ChunkedStream buffer of size fileSize in the Worker; files over
 * PROCESSING_LIMITS.MAX_PDF_SIZE_FOR_RANGE_BYTES are rejected with MemoryLimitError.
 */

import { getDocument, PDFDataRangeTransport } from "pdfjs-serverless";
import { PROCESSING_LIMITS } from "@/app-constants";
import { MemoryLimitError } from "@/lib/errors";
import type { ExtractionResult } from "@/services/file/file-extraction-service";

/** R2 bucket interface (subset we need) */
interface R2BucketLike {
	get(
		key: string,
		options?: { range?: { offset: number; length: number } }
	): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/**
 * Custom PDFDataRangeTransport that fetches requested byte ranges from R2 on demand.
 */
class R2PDFDataRangeTransport extends PDFDataRangeTransport {
	private r2: R2BucketLike;
	private fileKey: string;

	constructor(length: number, r2: R2BucketLike, fileKey: string) {
		super(length, null);
		this.r2 = r2;
		this.fileKey = fileKey;
		this.transportReady();
	}

	override requestDataRange(begin: number, end: number): void {
		const length = end - begin;
		void (async () => {
			try {
				const obj = await this.r2.get(this.fileKey, {
					range: { offset: begin, length },
				});
				if (!obj) {
					// biome-ignore lint/suspicious/noConsole: debug logging for wrangler tail (no env/logger here)
					console.warn("[pdf-r2-range] R2.get returned null", {
						fileKey: this.fileKey,
						begin,
						length,
					});
					this.onDataRange(begin, null);
					return;
				}
				const buf = await obj.arrayBuffer();
				this.onDataRange(begin, new Uint8Array(buf));
			} catch (e) {
				// biome-ignore lint/suspicious/noConsole: debug logging for wrangler tail (no env/logger here)
				console.error("[pdf-r2-range] R2 range request failed", {
					fileKey: this.fileKey,
					begin,
					length,
					error: e instanceof Error ? e.message : String(e),
				});
				this.onDataRange(begin, null);
			}
		})();
	}
}

/**
 * Extract text from a page range of a PDF stored in R2 using range requests only.
 * Use for large PDFs that must not be loaded fully into memory.
 */
export async function extractPdfPagesRangeFromR2(
	r2: R2BucketLike,
	fileKey: string,
	fileSize: number,
	startPage: number,
	endPage: number,
	totalPages?: number
): Promise<ExtractionResult> {
	const maxBytes = PROCESSING_LIMITS.MAX_PDF_SIZE_FOR_RANGE_BYTES;
	if (fileSize > maxBytes) {
		const fileSizeMB = fileSize / (1024 * 1024);
		const limitMB = maxBytes / (1024 * 1024);
		throw new MemoryLimitError(
			fileSizeMB,
			limitMB,
			fileKey,
			undefined,
			`This PDF (${fileSizeMB.toFixed(2)}MB) is too large to index in one piece. In the app, PDFs over ${limitMB}MB are split automatically before upload. Re-upload this file in the app to split and index it, or use a PDF under ${limitMB}MB.`
		);
	}
	const transport = new R2PDFDataRangeTransport(fileSize, r2, fileKey);
	const loadingTask = getDocument({
		length: fileSize,
		range: transport,
		useSystemFonts: true,
	});
	let pdf: Awaited<typeof loadingTask.promise>;
	try {
		pdf = await loadingTask.promise;
	} catch (loadError) {
		// biome-ignore lint/suspicious/noConsole: debug logging for wrangler tail (no env/logger here)
		console.error("[pdf-r2-range] getDocument failed", {
			fileKey,
			fileSize,
			startPage,
			endPage,
			error: loadError instanceof Error ? loadError.message : String(loadError),
		});
		throw loadError;
	}
	const numPages = totalPages ?? pdf.numPages;
	const actualStartPage = Math.max(1, Math.min(startPage, numPages));
	const actualEndPage = Math.max(actualStartPage, Math.min(endPage, numPages));

	if (actualStartPage > actualEndPage) {
		throw new Error(
			`Invalid page range: start (${startPage}) must be <= end (${endPage})`
		);
	}

	const pageTexts: string[] = [];
	for (let pageNum = actualStartPage; pageNum <= actualEndPage; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item: unknown) => (item as { str?: string }).str ?? "")
			.join(" ");
		if (pageText.trim().length > 0) {
			pageTexts.push(`[Page ${pageNum}]\n${pageText}`);
		}
	}

	const extractedText =
		pageTexts.join("\n\n") ||
		`No text extracted from pages ${actualStartPage}-${actualEndPage}`;

	return {
		text: extractedText,
		pagesExtracted: actualEndPage - actualStartPage + 1,
		totalPages: numPages,
	};
}
