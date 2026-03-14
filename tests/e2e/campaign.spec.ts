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
		await appShell.createCampaignButton.click();

		await createModal.createCampaign(campaignName, { waitForApi: true });

		await expect(appShell.getCampaignButton(campaignName)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("edit campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);
		const campaignDetails = new CampaignDetailsPage(page);

		await appShell.waitForReady();
		await appShell.createCampaignButton.click();
		await createModal.createCampaign("Original Name", { waitForApi: true });

		await createModal.doneButton.click();
		await expect(appShell.getCampaignButton(/Original Name/)).toBeVisible({
			timeout: 10_000,
		});
		await appShell.getCampaignButton(/Original Name/).click();

		await campaignDetails.editButton.click();
		await createModal.fillName("Edited Name");
		await campaignDetails.saveButton.click();

		await expect(appShell.getCampaignButton(/Edited Name/)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("delete campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);
		const campaignDetails = new CampaignDetailsPage(page);

		await appShell.waitForReady();
		await appShell.createCampaignButton.click();
		await createModal.createCampaign("To Delete", { waitForApi: true });

		await createModal.doneButton.click();
		await expect(appShell.getCampaignButton(/To Delete/)).toBeVisible({
			timeout: 10_000,
		});
		await appShell.getCampaignButton(/To Delete/).click();

		await campaignDetails.deleteCampaignButton.click();
		await campaignDetails.confirmDeleteButton.click();

		await expect(page.getByRole("button", { name: /To Delete/ })).toHaveCount(
			0,
			{ timeout: 10_000 }
		);
	});
});
