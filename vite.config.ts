import fs from "node:fs";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function ensureHtmlStringPlugin() {
  const indexHtmlPath = path.resolve(process.cwd(), "index.html");
  return {
    name: "vite:ensure-html-string",
    enforce: "pre" as const,
    load(id: string) {
      const normalized = path.normalize(id);
      if (
        normalized === indexHtmlPath ||
        normalized.endsWith(path.sep + "index.html")
      ) {
        let code = fs.readFileSync(id, "utf8");
        if (code.length > 0 && code.charCodeAt(0) === 0xfeff) {
          code = code.slice(1);
        }
        return { code };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    ensureHtmlStringPlugin(),
    react(),
    cloudflare({
      configPath: "./wrangler.dev.jsonc",
      persistState: false, // Don't persist state
    }),
    tailwindcss(),
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
