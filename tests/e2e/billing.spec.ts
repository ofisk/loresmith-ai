import { loginAsE2EUser } from "./helpers/auth";
import { expect, test } from "./lib/test";

test.describe("billing", () => {
	test("billing page loads when authenticated", async ({ page }) => {
		await loginAsE2EUser(page);

		await page.goto("/billing");

		await expect(page.getByTestId("billing-page")).toBeVisible({
			timeout: 10_000,
		});
	});
});
