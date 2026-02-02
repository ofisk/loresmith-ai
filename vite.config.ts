import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { OutputBundle, OutputChunk } from "rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Use JS entry and emit index.html in bundle to avoid vite:build-html load/transform InvalidArg on CI. */
function ciHtmlEntryPlugin(): Plugin {
  return {
    name: "vite:ci-html-entry",
    enforce: "post" as const,
    config(config: UserConfig) {
      const root = config.root ?? process.cwd();
      return {
        build: {
          rollupOptions: {
            ...config.build?.rollupOptions,
            input: path.resolve(root, "src/client.tsx"),
          },
        },
      };
    },
    generateBundle(_outputOptions, bundle: OutputBundle) {
      const entryChunk = Object.values(bundle).find(
        (o): o is OutputChunk =>
          o.type === "chunk" && (o as OutputChunk).isEntry === true
      );
      if (!entryChunk) return;
      const scriptHref = `/${entryChunk.fileName}`;
      const indexPath = path.join(process.cwd(), "index.html");
      let html = fs.readFileSync(indexPath, "utf8");
      html = html.replace(
        /(\bsrc=)(["'])(?:\/src\/client\.tsx|\.\/src\/client\.tsx)\2/,
        `$1$2${scriptHref}$2`
      );
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
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: clientEntry,
      external: ["cloudflare:email", "cloudflare:workers"],
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
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
  },
  envPrefix: ["VITE_"],
});
