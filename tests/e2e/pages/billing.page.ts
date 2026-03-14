import type { Page } from "@playwright/test";

/** Page object for the billing page. */
export class BillingPage {
	constructor(readonly page: Page) {}

	get mainContent() {
		return this.page.getByTestId("billing-page");
	}

	async goto(baseURL = "http://localhost:8787"): Promise<void> {
		await this.page.goto(`${baseURL}/billing`);
		await this.mainContent.waitFor({ state: "visible", timeout: 10_000 });
	}
}
