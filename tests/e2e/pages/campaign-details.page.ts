import type { Page } from "@playwright/test";

/** Page object for the campaign details modal (edit, delete, tabs). */
export class CampaignDetailsPage {
	constructor(readonly page: Page) {}

	get editButton() {
		return this.page.getByTestId("campaign-details-edit");
	}

	get saveButton() {
		return this.page.getByTestId("campaign-details-save");
	}

	get deleteCampaignButton() {
		return this.page.getByRole("button", { name: "Delete campaign" });
	}

	get confirmDeleteButton() {
		return this.page.getByTestId("confirm-delete");
	}
}
