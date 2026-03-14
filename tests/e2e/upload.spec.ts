import { loginAsE2EUser } from "./helpers/auth";
import { expect, test } from "./lib/test";
import { AppShellPage } from "./pages/app-shell.page";
import { UploadModal } from "./pages/upload-modal.page";

test.describe("file upload", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsE2EUser(page);
		// Reduce animation-related timing issues on Firefox/WebKit
		await page.emulateMedia({ reducedMotion: "reduce" });
	});

	test("upload small file and see it in library", async ({
		page,
		browserName,
	}) => {
		test.skip(
			browserName !== "chromium",
			"File upload flaky on Firefox/WebKit – runs on Chromium only"
		);
		const appShell = new AppShellPage(page);
		const uploadModal = new UploadModal(page);

		await appShell.waitForReady();
		await page.getByRole("button", { name: /build your library/i }).click();

		await uploadModal.uploadFile(UploadModal.sampleFilePath);

		// Modal closes on success; file appears in sidebar library (collapsed by default).
		// Expand the library section so the file list is visible.
		await uploadModal.librarySectionButton.click();

		// Wait for FILE_UPLOAD.COMPLETED to trigger fetchResources and for the file to render
		await expect(page.getByText("sample.txt")).toBeVisible({
			timeout: 20_000,
		});
	});
});
