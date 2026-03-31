import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
	addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
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
