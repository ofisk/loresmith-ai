import { loginAsE2EUser } from "./helpers/auth";
import { expect, test } from "./lib/test";
import { BillingPage } from "./pages/billing.page";

test.describe("billing", () => {
	test("billing page loads when authenticated", async ({ page }) => {
		await loginAsE2EUser(page);

		const billingPage = new BillingPage(page);
		await billingPage.goto();

		await expect(billingPage.mainContent).toBeVisible();
	});
});
