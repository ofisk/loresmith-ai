import type { Page } from "@playwright/test";

/** Page object for the login form (auth modal or sign-in page). */
export class LoginPage {
	constructor(readonly page: Page) {}

	/** Button to open the auth modal (Sign in / Sign up in header). */
	get openAuthButton() {
		return this.page.getByRole("button", { name: /sign in|sign up/i }).first();
	}

	/** Sign in button inside the auth modal. */
	get submitButton() {
		return this.page.getByRole("button", { name: /sign in/i });
	}

	get usernameInput() {
		return this.page.getByLabel(/username/i);
	}

	get passwordInput() {
		return this.page.getByLabel(/^password/i);
	}

	/** Wait for the sign in / sign up button to be visible (auth UI loaded). */
	async waitForAuthUI(timeout = 10_000): Promise<void> {
		await this.openAuthButton.waitFor({ state: "visible", timeout });
	}

	/** Fill credentials and sign in. Assumes auth modal is already open. */
	async login(username: string, password: string): Promise<void> {
		await this.usernameInput.fill(username);
		await this.passwordInput.fill(password);
		await this.submitButton.click();
	}

	/** Navigate to root and wait for auth UI. */
	async goto(baseURL = "http://localhost:8787"): Promise<void> {
		await this.page.goto(baseURL);
		await this.waitForAuthUI();
	}
}
