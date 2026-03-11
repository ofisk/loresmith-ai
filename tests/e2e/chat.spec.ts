import { expect, test } from "@playwright/test";
import { loginAsE2EUser } from "./helpers/auth";
import { createMockChatStreamBody } from "./helpers/mock-chat-stream";

const MOCK_RESPONSE = "Hello from E2E mock";

test.describe("AI chat", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsE2EUser(page);
	});

	test("send message and receive mocked response", async ({ page }) => {
		await page.route("**/api/agents/**", (route) => {
			if (route.request().method() === "POST") {
				return route.fulfill({
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"x-vercel-ai-ui-message-stream": "v1",
					},
					body: createMockChatStreamBody(MOCK_RESPONSE),
				});
			}
			return route.continue();
		});

		await expect(
			page.locator(".tour-campaign-selector, .tour-campaigns-section").first()
		).toBeVisible({ timeout: 10_000 });

		const textarea = page
			.getByRole("textbox", { name: /message|prompt/i })
			.or(page.locator("textarea"));
		await textarea.fill("Hello");
		await page.getByRole("button", { name: /send message/i }).click();

		await expect(page.getByText(MOCK_RESPONSE)).toBeVisible({
			timeout: 15_000,
		});
	});
});
