import type { Locator, Page } from "@playwright/test";
import { E2E_UI_TIMEOUT_MS } from "../env";

/**
 * Page object for the main app shell (post-login UI with campaigns and chat).
 *
 * Campaigns live in a modal opened from the sidebar rail, not inline in the
 * sidebar, so reads of the campaign list must open that dialog first.
 */
export class AppShellPage {
	constructor(readonly page: Page) {}

	/** Wait for the main app UI to be visible after login. */
	async waitForReady(timeout = E2E_UI_TIMEOUT_MS): Promise<void> {
		await this.page
			.getByTestId("app-main")
			.waitFor({ state: "visible", timeout });
	}

	/** Sidebar rail button that opens the campaigns dialog. */
	get campaignsToggle(): Locator {
		return this.page.getByTestId("campaigns-toggle");
	}

	/** The campaigns dialog itself (list + "Create campaign"). */
	get campaignsDialog(): Locator {
		return this.page.getByTestId("campaigns-dialog");
	}

	/** Open the campaigns dialog, or leave it open if it already is. */
	async openCampaignsDialog(timeout = E2E_UI_TIMEOUT_MS): Promise<void> {
		if (await this.campaignsDialog.isVisible()) return;
		await this.campaignsToggle.click();
		await this.campaignsDialog.waitFor({ state: "visible", timeout });
	}

	/** Close the campaigns dialog if it is open. */
	async closeCampaignsDialog(): Promise<void> {
		if (!(await this.campaignsDialog.isVisible())) return;
		await this.campaignsToggle.click();
		await this.campaignsDialog.waitFor({ state: "hidden" });
	}

	/**
	 * Open the create-campaign flow via the campaigns dialog.
	 *
	 * Deliberately avoids the welcome-screen "Create your first campaign" CTA:
	 * that button only exists while the account has no campaigns, so it detaches
	 * as soon as campaign data loads. This route is stable in both states.
	 */
	async openCreateCampaign(): Promise<void> {
		await this.openCampaignsDialog();
		await this.page.getByTestId("create-campaign-trigger").click();
	}

	/** Campaign entry inside the campaigns dialog. Open the dialog first. */
	getCampaignButton(name: string | RegExp): Locator {
		const matcher = typeof name === "string" ? new RegExp(name) : name;
		return this.campaignsDialog
			.getByTestId("campaign-item")
			.filter({ hasText: matcher })
			.first();
	}

	/** All campaign entries currently listed in the dialog. */
	get campaignItems(): Locator {
		return this.campaignsDialog.getByTestId("campaign-item");
	}
}
