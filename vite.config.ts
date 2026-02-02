import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { OutputBundle, OutputChunk } from "rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";

function ensureHtmlStringPlugin() {
  const indexHtmlAbsolute = path.resolve(__dirname, "index.html");
  return {
    name: "vite:ensure-html-string",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (
        source === "index.html" ||
        source.endsWith("/index.html") ||
        source.endsWith("\\index.html")
      ) {
        return indexHtmlAbsolute;
      }
      return null;
    },
    load(id: string) {
      const idPath = id.replace(/\?.*$/, "").replace(/#.*$/, "");
      const isIndexHtml =
        idPath === "index.html" ||
        idPath.endsWith("/index.html") ||
        idPath.endsWith("\\index.html");
      if (!isIndexHtml) return null;
      const filePath = path.join(process.cwd(), "index.html");
      let code = fs.readFileSync(filePath, "utf8");
      if (code.length > 0 && code.charCodeAt(0) === 0xfeff) {
        code = code.slice(1);
      }
      return { code: String(code) };
    },
  };
}

/** Post-phase transform: ensure index.html module code is a string (CI Rollup setSource InvalidArg). */
function ensureHtmlStringPostPlugin() {
  return {
    name: "vite:ensure-html-string-post",
    enforce: "post" as const,
    transform(code: string | Buffer | undefined, id: string) {
      const idPath = id.replace(/\?.*$/, "").replace(/#.*$/, "");
      const isIndexHtml =
        idPath === "index.html" ||
        idPath.endsWith("/index.html") ||
        idPath.endsWith("\\index.html");
      if (!isIndexHtml) return null;
      return typeof code === "string" ? code : String(code ?? "");
    },
  };
}

/** When CI: use JS entry and emit index.html in bundle to avoid vite:build-html load/transform InvalidArg. */
function ciHtmlEntryPlugin(): Plugin {
  return {
    name: "vite:ci-html-entry",
    enforce: "post" as const,
    config(config: UserConfig) {
      if (!isCI) return;
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
      if (!isCI) return;
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

export default defineConfig({
  plugins: [
    ensureHtmlStringPlugin(),
    ensureHtmlStringPostPlugin(),
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
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
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
