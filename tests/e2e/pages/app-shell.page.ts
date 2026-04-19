import type { Page } from "@playwright/test";
import { E2E_UI_TIMEOUT_MS } from "../env";

/** Page object for the main app shell (post-login UI with campaigns and chat). */
export class AppShellPage {
	constructor(readonly page: Page) {}

	/** Wait for the main app UI to be visible after login. */
	async waitForReady(timeout = E2E_UI_TIMEOUT_MS): Promise<void> {
		await this.page
			.getByTestId("app-main")
			.waitFor({ state: "visible", timeout });
	}

	/** Button to create a new campaign (Create campaign / Create your first campaign). */
	get createCampaignButton() {
		return this.page
			.getByRole("button", {
				name: /create your first campaign|create campaign/i,
			})
			.first();
	}

	/** Campaign button in the sidebar by name (regex or string). */
	getCampaignButton(name: string | RegExp) {
		const matcher = typeof name === "string" ? new RegExp(name) : name;
		return this.page.getByRole("button", { name: matcher }).first();
	}
}
