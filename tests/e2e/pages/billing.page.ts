import type { Page } from "@playwright/test";
import { E2E_UI_TIMEOUT_MS } from "../env";

/** Page object for the billing page. */
export class BillingPage {
	constructor(readonly page: Page) {}

	get mainContent() {
		return this.page.getByTestId("billing-page");
	}

	async goto(baseURL = "http://localhost:8787"): Promise<void> {
		await this.page.goto(`${baseURL}/billing`, {
			waitUntil: "domcontentloaded",
		});
		await this.mainContent.waitFor({
			state: "visible",
			timeout: E2E_UI_TIMEOUT_MS,
		});
	}
}
