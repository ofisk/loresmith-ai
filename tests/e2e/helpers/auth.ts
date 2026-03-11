import type { Page } from "@playwright/test";

export const E2E_USERNAME = "e2e-test-user";
export const E2E_PASSWORD = "e2e-test-password";

/**
 * Log in via API and set JWT in localStorage, then reload to pick up auth state.
 */
export async function loginAsE2EUser(
	page: Page,
	baseURL = "http://localhost:8787"
): Promise<void> {
	const res = await page.request.post(`${baseURL}/auth/login`, {
		data: { username: E2E_USERNAME, password: E2E_PASSWORD },
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Login failed: ${res.status} ${body}`);
	}
	const json = (await res.json()) as { token?: string };
	const token = json.token;
	if (!token) {
		throw new Error("Login response missing token");
	}
	await page.goto(baseURL);
	await page.evaluate((t) => {
		localStorage.setItem("loresmith-jwt", t);
		// Skip the onboarding tour so it doesn't block interactions (e.g. Upload button)
		localStorage.setItem("loresmith-tour-completed", "true");
	}, token);
	await page.reload();
}
