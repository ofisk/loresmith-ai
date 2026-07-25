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

	// Clean up any sample.txt left by a failed attempt so retries don't hit 409.
	test.afterEach(async ({ page }) => {
		try {
			const jwt = await page.evaluate(() =>
				localStorage.getItem("loresmith-jwt")
			);
			if (!jwt) return;
			const listRes = await page.request.get("/api/library/files", {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (!listRes.ok()) return;
			const { files } = (await listRes.json()) as {
				files: { file_key: string; file_name: string }[];
			};
			for (const file of files ?? []) {
				if (file.file_name === "sample.txt") {
					await page.request.delete(
						`/api/library/files/${encodeURIComponent(file.file_key)}`,
						{ headers: { Authorization: `Bearer ${jwt}` } }
					);
				}
			}
		} catch (_) {
			// Best-effort cleanup; don't fail the test if this errors
		}
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
