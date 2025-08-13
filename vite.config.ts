import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["nanoid"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Redirect Node.js modules to our working polyfills
      async_hooks: path.resolve(__dirname, "./src/node-polyfills.ts"),
      "node:os": path.resolve(__dirname, "./src/node-polyfills.ts"),
      path: path.resolve(__dirname, "./src/node-polyfills.ts"),
      os: path.resolve(__dirname, "./src/node-polyfills.ts"),
      // Redirect nanoid to our custom ID generator
      nanoid: path.resolve(__dirname, "./src/utils/nanoid"),
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
        format: "es",
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            // Separate AI SDK packages to avoid nanoid issues
            if (id.includes("@ai-sdk") || id.includes("ai")) {
              return "ai-sdk-vendor";
            }
            if (id.includes("agents")) {
              return "agents-vendor";
            }
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-vendor";
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
