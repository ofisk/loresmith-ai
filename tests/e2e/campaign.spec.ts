import { loginAsE2EUser } from "./helpers/auth";
import { uniqueCampaignName } from "./helpers/test-utils";
import { expect, test } from "./lib/test";
import { AppShellPage } from "./pages/app-shell.page";
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

		await expect(
			page.getByRole("button", { name: new RegExp(campaignName) }).first()
		).toBeVisible({ timeout: 10_000 });
	});

	test("edit campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);

		await appShell.waitForReady();
		await appShell.createCampaignButton.click();
		await createModal.createCampaign("Original Name", { waitForApi: true });

		await page.getByRole("button", { name: "Done" }).click();
		await expect(
			page.getByRole("button", { name: /Original Name/ }).first()
		).toBeVisible({ timeout: 10_000 });
		await page
			.getByRole("button", { name: /Original Name/ })
			.first()
			.click();

		await page.getByRole("button", { name: "Edit" }).click();
		await createModal.fillName("Edited Name");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(
			page.getByRole("button", { name: /Edited Name/ }).first()
		).toBeVisible({ timeout: 10_000 });
	});

	test("delete campaign", async ({ page }) => {
		const appShell = new AppShellPage(page);
		const createModal = new CreateCampaignModal(page);

		await appShell.waitForReady();
		await appShell.createCampaignButton.click();
		await createModal.createCampaign("To Delete", { waitForApi: true });

		await page.getByRole("button", { name: "Done" }).click();
		await expect(
			page.getByRole("button", { name: /To Delete/ }).first()
		).toBeVisible({ timeout: 10_000 });
		await page
			.getByRole("button", { name: /To Delete/ })
			.first()
			.click();

		await page.getByRole("button", { name: "Delete campaign" }).click();
		await page.getByRole("button", { name: "Confirm delete" }).click();

		await expect(page.getByRole("button", { name: /To Delete/ })).toHaveCount(
			0
		);
	});
});
