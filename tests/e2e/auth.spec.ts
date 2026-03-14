import { E2E_PASSWORD, E2E_USERNAME, loginAsE2EUser } from "./helpers/auth";
import { expect, test } from "./lib/test";
import { AppShellPage } from "./pages/app-shell.page";
import { LoginPage } from "./pages/login.page";

test.describe("auth flow", () => {
	test("sign in with seeded user", async ({ page }) => {
		const loginPage = new LoginPage(page);
		const appShell = new AppShellPage(page);

		await loginPage.goto();
		await loginPage.openAuthButton.click();
		await loginPage.login(E2E_USERNAME, E2E_PASSWORD);

		await expect(
			page.getByRole("button", { name: /sign in|sign up/i })
		).not.toBeVisible({ timeout: 10_000 });

		await appShell.waitForReady();
	});

	test("auth helper sets JWT and app shows main UI", async ({ page }) => {
		await loginAsE2EUser(page);
		const appShell = new AppShellPage(page);
		await appShell.waitForReady();
	});
});
