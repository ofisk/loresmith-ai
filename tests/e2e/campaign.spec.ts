import { loginAsE2EUser } from "./helpers/auth";
import { uniqueCampaignName } from "./helpers/test-utils";
import { expect, test } from "./lib/test";
import { AppShellPage } from "./pages/app-shell.page";
import { CampaignDetailsPage } from "./pages/campaign-details.page";
import { CreateCampaignModal } from "./pages/create-campaign-modal.page";

test.describe("campaign management", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsE2EUser(page);
	});

	test("create campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);
		const campaignName = uniqueCampaignName("E2E Test Campaign");

		await appShell.waitForReady();
		await appShell.openCreateCampaign();

		await createModal.createCampaign(campaignName, { waitForApi: true });
		await createModal.doneButton.click();

		await appShell.openCampaignsDialog();
		await expect(appShell.getCampaignButton(campaignName)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("edit campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);
		const campaignDetails = new CampaignDetailsPage(page);
		const originalName = uniqueCampaignName("Original Name");
		const editedName = uniqueCampaignName("Edited Name");

		await appShell.waitForReady();
		await appShell.openCreateCampaign();
		await createModal.createCampaign(originalName, { waitForApi: true });

		await createModal.doneButton.click();
		await appShell.openCampaignsDialog();
		await expect(appShell.getCampaignButton(originalName)).toBeVisible({
			timeout: 10_000,
		});
		// Opening a campaign closes the campaigns dialog and opens its details.
		await appShell.getCampaignButton(originalName).click();

		await campaignDetails.editButton.click();
		await createModal.fillName(editedName);
		await campaignDetails.saveButton.click();

		await appShell.openCampaignsDialog();
		await expect(appShell.getCampaignButton(editedName)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("delete campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);
		const campaignDetails = new CampaignDetailsPage(page);
		const campaignName = uniqueCampaignName("To Delete");

		await appShell.waitForReady();
		await appShell.openCreateCampaign();
		await createModal.createCampaign(campaignName, { waitForApi: true });

		await createModal.doneButton.click();
		await appShell.openCampaignsDialog();
		await expect(appShell.getCampaignButton(campaignName)).toBeVisible({
			timeout: 10_000,
		});
		await appShell.getCampaignButton(campaignName).click();

		await campaignDetails.deleteCampaignButton.click();
		await campaignDetails.confirmDeleteButton.click();

		await appShell.openCampaignsDialog();
		await expect(
			appShell.campaignItems.filter({ hasText: campaignName })
		).toHaveCount(0, { timeout: 10_000 });
	});
});
