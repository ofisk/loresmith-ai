import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shapes used by {@link ciHtmlEntryPlugin} generateBundle (Vite 8 uses Rolldown; avoid importing `rollup`). */
interface OutputChunkEntry {
	readonly type: "chunk";
	readonly fileName: string;
	readonly isEntry?: boolean;
}

interface OutputAssetEntry {
	readonly type: "asset";
	readonly fileName: string;
}

type OutputBundleLike = Record<
	string,
	OutputChunkEntry | OutputAssetEntry | { type: string }
>;

type BundleModule = OutputBundleLike[string];

function isEntryChunk(o: BundleModule): o is OutputChunkEntry {
	if (o.type !== "chunk") return false;
	return (o as OutputChunkEntry).isEntry === true;
}

function isCssAsset(o: BundleModule): o is OutputAssetEntry {
	return (
		o.type === "asset" &&
		"fileName" in o &&
		typeof (o as OutputAssetEntry).fileName === "string" &&
		(o as OutputAssetEntry).fileName.endsWith(".css")
	);
}

/** Use JS entry and emit index.html in bundle to avoid vite:build-html load/transform InvalidArg on CI. */
function ciHtmlEntryPlugin(): Plugin {
	return {
		name: "vite:ci-html-entry",
		enforce: "post" as const,
		config(config: UserConfig) {
			const root = config.root ?? process.cwd();
			// Only the client environment may use the SPA entry — root-level
			// build.rollupOptions is inherited by the Worker env and breaks dev/build.
			return {
				environments: {
					client: {
						build: {
							rollupOptions: {
								...config.environments?.client?.build?.rollupOptions,
								input: path.resolve(root, "src/client.tsx"),
							},
						},
					},
				},
			};
		},
		generateBundle(_outputOptions, bundle: OutputBundleLike) {
			const entryChunk = Object.values(bundle).find(isEntryChunk);
			if (!entryChunk) return;
			const scriptHref = `/${entryChunk.fileName}`;
			// Find the main stylesheet so we can inject it into HTML (ensures CSS loads in production)
			const cssAsset = Object.values(bundle).find(isCssAsset);
			const cssHref = cssAsset ? `/${cssAsset.fileName}` : null;
			const indexPath = path.join(process.cwd(), "index.html");
			let html = fs.readFileSync(indexPath, "utf8");
			html = html.replace(
				/(\bsrc=)(["'])(?:\/src\/client\.tsx|\.\/src\/client\.tsx)\2/,
				`$1$2${scriptHref}$2`
			);
			if (cssHref) {
				const linkTag = `    <link rel="stylesheet" href="${cssHref}" />`;
				html = html.replace("</head>", `\n${linkTag}\n  </head>`);
			}
			this.emitFile({ type: "asset", fileName: "index.html", source: html });
		},
	};
}

const clientEntry = path.resolve(__dirname, "src/client.tsx");

export default defineConfig({
	plugins: [
		react(),
		cloudflare({
			configPath: "./wrangler.dev.jsonc",
			persistState: false, // Don't persist state
		}),
		tailwindcss(),
		ciHtmlEntryPlugin(),
	],
	ssr: {
		noExternal: ["agents", "ai", "cron-schedule", "mimetext"],
	},
	// Explicit client environment input so @cloudflare/vite-plugin uses JS entry (avoids vite:build-html InvalidArg on CI).
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: clientEntry,
					external: ["cloudflare:email", "cloudflare:workers"],
					output: {
						// Rolldown expects a function here; object form breaks CI (e2e webServer).
						manualChunks(id: string) {
							if (
								id.includes("/node_modules/react-dom/") ||
								id.includes("/node_modules/react/")
							) {
								return "vendor";
							}
						},
					},
				},
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			// Redirect Node.js modules to empty polyfills
			"node:events": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:tty": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:stream": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:process": path.resolve(__dirname, "./src/node-polyfills.ts"),
			"node:async_hooks": path.resolve(__dirname, "./src/node-polyfills.ts"),
			// Non-prefixed versions
			events: path.resolve(__dirname, "./src/node-polyfills.ts"),
			tty: path.resolve(__dirname, "./src/node-polyfills.ts"),
			stream: path.resolve(__dirname, "./src/node-polyfills.ts"),
			process: path.resolve(__dirname, "./src/node-polyfills.ts"),
			async_hooks: path.resolve(__dirname, "./src/node-polyfills.ts"),
		},
	},
	define: {
		global: "globalThis",
		// Define environment variables for client-side
		"import.meta.env.VITE_API_URL": JSON.stringify(
			process.env.VITE_API_URL || "https://loresmith.ai"
		),
		// Feature flags from GitHub Actions variables (FEATURES JSON), baked at build time
		"import.meta.env.VITE_FEATURES": JSON.stringify(
			process.env.VITE_FEATURES || "{}"
		),
	},
	envPrefix: ["VITE_"],
});
