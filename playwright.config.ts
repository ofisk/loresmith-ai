import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
	use: {
		baseURL: "http://localhost:8787",
		trace: "on-first-retry",
		video: "on-first-retry",
		screenshot: "only-on-failure",
	},
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
	webServer: {
		command: "npm run e2e:server",
		url: "http://localhost:8787",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
