import type { Preview } from "@storybook/react";
import { TooltipProvider } from "@/providers/TooltipProvider";
import "../src/styles.css";

const preview: Preview = {
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [
				{ name: "Dark", value: "#0a0a0a" },
				{ name: "Light", value: "#fafafa" },
			],
		},
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
	decorators: [
		(Story) => (
			<TooltipProvider>
				<div
					className="dark min-h-[120px] min-w-[200px] bg-neutral-950 p-6 font-sans text-neutral-100 antialiased"
					style={{
						fontFamily:
							'-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
					}}
				>
					<Story />
				</div>
			</TooltipProvider>
		),
	],
};

export default preview;
