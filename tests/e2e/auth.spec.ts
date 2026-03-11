import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERNAME, loginAsE2EUser } from "./helpers/auth";

test.describe("auth flow", () => {
	test("sign in with seeded user", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: /sign in|sign up/i }).first()
		).toBeVisible({ timeout: 10_000 });

		await page
			.getByRole("button", { name: /sign in/i })
			.first()
			.click();

		await page.getByLabel(/username/i).fill(E2E_USERNAME);
		await page.getByLabel(/^password/i).fill(E2E_PASSWORD);
		await page.getByRole("button", { name: /sign in/i }).click();

		await expect(
			page.getByRole("button", { name: /sign in|sign up/i })
		).not.toBeVisible({ timeout: 5000 });

		await expect(
			page.locator(".tour-campaign-selector, .tour-campaigns-section").first()
		).toBeVisible({ timeout: 5000 });
	});

	test("auth helper sets JWT and app shows main UI", async ({ page }) => {
		await loginAsE2EUser(page);
		await expect(
			page.locator(".tour-campaign-selector, .tour-campaigns-section").first()
		).toBeVisible({ timeout: 10_000 });
	});
});
