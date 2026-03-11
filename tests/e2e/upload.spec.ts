import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loginAsE2EUser } from "./helpers/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(__dirname, "fixtures", "sample.txt");

test.describe("file upload", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsE2EUser(page);
	});

	test("upload small file and see it in library", async ({ page }) => {
		await expect(
			page.locator(".tour-campaign-selector, .tour-campaigns-section").first()
		).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: /build your library/i }).click();

		const fileInput = page.getByLabel("Choose files to upload");
		await fileInput.setInputFiles(samplePath);

		await Promise.all([
			page.waitForResponse(
				(resp) =>
					(resp.url().includes("/api/library/files") ||
						resp.url().includes("/api/upload/")) &&
					resp.status() >= 200 &&
					resp.status() < 400
			),
			page.getByRole("button", { name: /^Upload$/ }).click(),
		]);

		// Wait for library to refetch after upload
		await page.waitForResponse(
			(r) =>
				r.url().includes("/api/library/files") &&
				r.request().method() === "GET" &&
				r.status() === 200,
			{ timeout: 10_000 }
		);

		await expect(page.getByText("sample.txt")).toBeVisible({
			timeout: 20_000,
		});
	});
});
