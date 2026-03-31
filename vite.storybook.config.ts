/**
 * Vite config used only by Storybook — avoids merging the app vite.config
 * (Cloudflare plugin + client entry), which would bundle the entire app.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: path.resolve(__dirname),
	envDir: path.resolve(__dirname),
	plugins: [react(), tailwindcss()],
	server: {
		fs: {
			allow: [path.resolve(__dirname)],
		},
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
		],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"node:events": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:tty": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:stream": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:process": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:async_hooks": path.resolve(__dirname, "./src/node-polyfills.ts"),
			events: path.resolve(__dirname, "./src/node-polyfills.ts"),
			tty: path.resolve(__dirname, "./src/node-polyfills.ts"),
			stream: path.resolve(__dirname, "./src/node-polyfills.ts"),
			process: path.resolve(__dirname, "./src/node-polyfills.ts"),
			async_hooks: path.resolve(__dirname, "./src/node-polyfills.ts"),
		},
	},
	define: {
		global: "globalThis",
		"import.meta.env.VITE_API_URL": JSON.stringify(
			process.env.VITE_API_URL ?? "https://loresmith.ai"
		),
		"import.meta.env.VITE_FEATURES": JSON.stringify(
			process.env.VITE_FEATURES ?? "{}"
		),
	},
});
