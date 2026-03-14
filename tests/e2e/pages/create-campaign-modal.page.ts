import type { Page } from "@playwright/test";

/** Page object for the create campaign modal. */
export class CreateCampaignModal {
	constructor(readonly page: Page) {}

	get campaignNameInput() {
		return this.page.getByLabel("Campaign name");
	}

	get submitButton() {
		return this.page.getByTestId("create-campaign-submit");
	}

	get doneButton() {
		return this.page.getByTestId("create-campaign-done");
	}

	async fillName(name: string): Promise<void> {
		await this.campaignNameInput.fill(name);
	}

	async submit(): Promise<void> {
		await this.submitButton.click();
	}

	/** Fill name and submit, optionally waiting for the API response. */
	async createCampaign(
		name: string,
		options?: { waitForApi?: boolean }
	): Promise<void> {
		await this.fillName(name);
		if (options?.waitForApi) {
			await Promise.all([
				this.page.waitForResponse(
					(resp) =>
						resp.url().includes("/api/campaigns") &&
						resp.request().method() === "POST" &&
						resp.status() === 201
				),
				this.submit(),
			]);
		} else {
			await this.submit();
		}
	}
}
