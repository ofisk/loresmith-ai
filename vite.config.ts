import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare(), tailwindcss()],
  ssr: {
    noExternal: ["agents", "ai", "cron-schedule", "mimetext"],
  },
  build: {
    rollupOptions: {
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
      process.env.VITE_API_URL || "https://loresmith-ai.oren-t-fisk.workers.dev"
    ),
  },
  envPrefix: ["VITE_"],
});
