import { loginAsE2EUser } from "./helpers/auth";
import { createMockChatStreamBody } from "./helpers/mock-chat-stream";
import { expect, test } from "./lib/test";
import { AppShellPage } from "./pages/app-shell.page";

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

		const appShell = new AppShellPage(page);
		await appShell.waitForReady();

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
