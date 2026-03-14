import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Page object for the file upload modal. */
export class UploadModal {
	constructor(readonly page: Page) {}

	get chooseFilesInput() {
		return this.page.getByLabel("Choose files to upload");
	}

	get uploadButton() {
		return this.page.getByRole("button", { name: /^Upload$/ });
	}

	get librarySectionButton() {
		return this.page.getByRole("button", { name: /your resource library/i });
	}

	/** Upload a file and wait for the PUT request to complete. */
	async uploadFile(filePath: string): Promise<void> {
		await this.chooseFilesInput.setInputFiles(filePath);
		await Promise.all([
			this.page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/upload/direct/") &&
					resp.request().method() === "PUT" &&
					resp.status() >= 200 &&
					resp.status() < 400
			),
			this.uploadButton.click(),
		]);
	}

	/** Path to the sample.txt fixture. */
	static get sampleFilePath(): string {
		return path.join(__dirname, "..", "fixtures", "sample.txt");
	}
}
