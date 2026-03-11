import { expect, test } from "@playwright/test";
import { loginAsE2EUser } from "./helpers/auth";

test.describe("billing", () => {
	test("billing page loads when authenticated", async ({ page }) => {
		await loginAsE2EUser(page);

		await page.goto("/billing");

		await expect(
			page.getByText(/billing|usage|plan|free|subscription/i).first()
		).toBeVisible({ timeout: 10_000 });
	});
});
