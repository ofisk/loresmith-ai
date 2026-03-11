import { expect, test } from "@playwright/test";
import { loginAsE2EUser } from "./helpers/auth";

test.describe("campaign management", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsE2EUser(page);
	});

	test("create campaign", async ({ page }) => {
		await expect(
			page.locator(".tour-campaign-selector, .tour-campaigns-section").first()
		).toBeVisible({ timeout: 10_000 });

		await page
			.getByRole("button", {
				name: /create your first campaign|create campaign/i,
			})
			.first()
			.click();

		await page.getByLabel("Campaign name").fill("E2E Test Campaign");
		await Promise.all([
			page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/campaigns") &&
					resp.request().method() === "POST" &&
					resp.status() === 201
			),
			page.getByTestId("create-campaign-submit").click(),
		]);

		await expect(
			page.locator(".tour-campaigns-section").getByText("E2E Test Campaign", {
				exact: true,
			})
		).toBeVisible({ timeout: 10_000 });
	});

	test("edit campaign", async ({ page }) => {
		await expect(page.locator(".tour-campaigns-section").first()).toBeVisible({
			timeout: 10_000,
		});

		await page
			.getByRole("button", {
				name: /create your first campaign|create campaign/i,
			})
			.first()
			.click();
		await page.getByLabel("Campaign name").fill("Original Name");
		await Promise.all([
			page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/campaigns") &&
					resp.request().method() === "POST" &&
					resp.status() === 201
			),
			page.getByTestId("create-campaign-submit").click(),
		]);

		await expect(page.getByText("Original Name")).toBeVisible({
			timeout: 10_000,
		});
		await page
			.locator(".tour-campaigns-section")
			.getByText("Original Name")
			.click();

		await page.getByRole("button", { name: "Edit" }).click();
		await page.getByLabel("Campaign name").fill("Edited Name");
		await page.getByRole("button", { name: "Save" }).click();

		await expect(page.getByText("Edited Name")).toBeVisible({ timeout: 5000 });
	});

	test("delete campaign", async ({ page }) => {
		await expect(page.locator(".tour-campaigns-section").first()).toBeVisible({
			timeout: 10_000,
		});

		await page
			.getByRole("button", {
				name: /create your first campaign|create campaign/i,
			})
			.first()
			.click();
		await page.getByLabel("Campaign name").fill("To Delete");
		await Promise.all([
			page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/campaigns") &&
					resp.request().method() === "POST" &&
					resp.status() === 201
			),
			page.getByTestId("create-campaign-submit").click(),
		]);

		await expect(page.getByText("To Delete")).toBeVisible({
			timeout: 10_000,
		});
		await page
			.locator(".tour-campaigns-section")
			.getByText("To Delete")
			.click();

		await page.getByRole("button", { name: "Delete campaign" }).click();
		await page.getByRole("button", { name: "Confirm delete" }).click();

		await expect(page.getByText("To Delete")).not.toBeVisible({
			timeout: 5000,
		});
	});
});
