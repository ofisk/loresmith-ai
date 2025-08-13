import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Redirect Node.js modules to our working polyfills
      async_hooks: path.resolve(__dirname, "./src/node-polyfills.ts"),
      "node:os": path.resolve(__dirname, "./src/node-polyfills.ts"),
      path: path.resolve(__dirname, "./src/node-polyfills.ts"),
      os: path.resolve(__dirname, "./src/node-polyfills.ts"),
    },
  },
  define: {
    global: "globalThis",
    // Provide basic process polyfills
    "process.platform": '"cloudflare"',
    "process.env": "{}",
    "process.version": '"v18.0.0"',
    "process.versions": "{}",
    "process.cwd": '"/"',
    "process.exit": "undefined",
    "process.stdout": "null",
    "process.stderr": "null",
    "process.stdin": "null",
    Buffer: "Uint8Array",
    __dirname: '"/"',
    __filename: '"server.js"',
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:email", "cloudflare:workers"],
      output: {
        manualChunks: (id) => {
          // Simplified chunking to avoid React/AI vendor conflicts
          if (id.includes("node_modules")) {
            // Keep React and AI in the same vendor chunk to avoid loading race conditions
            if (
              id.includes("react") ||
              id.includes("react-dom") ||
              id.includes("@ai-sdk") ||
              id.includes("ai") ||
              id.includes("agents")
            ) {
              return "react-ai-vendor";
            }
            // Put other node_modules in vendor chunk
            return "vendor";
          }
          return null;
        },
      },
    },
  },
});
