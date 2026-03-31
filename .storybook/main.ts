import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
	addons: [
		{
			name: "@storybook/addon-essentials",
			options: {
				docs: false,
			},
		},
		"@storybook/addon-a11y",
	],
	framework: {
		name: "@storybook/react-vite",
		options: {
			builder: {
				// Do not merge root vite.config.ts (Cloudflare + app entry).
				viteConfigPath: "vite.storybook.config.ts",
			},
		},
	},
};

export default config;
