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

		await page.getByRole("button", { name: /^Upload$/ }).click();

		await expect(page.getByText("sample.txt")).toBeVisible({
			timeout: 15_000,
		});
	});
});
