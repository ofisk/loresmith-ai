import { loginAsE2EUser } from "../helpers/auth";
import { test as base, expect } from "../lib/test";
import { AppShellPage } from "../pages/app-shell.page";

type AuthFixtures = {
	appShell: AppShellPage;
};

/** Extended test with authenticated app shell (loginAsE2EUser runs before each test). */
export const test = base.extend<AuthFixtures>({
	appShell: async ({ page }, use) => {
		await loginAsE2EUser(page);
		await use(new AppShellPage(page));
	},
});

export { expect };
