import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor libraries into separate chunks
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-vendor";
            }
            if (
              id.includes("@ai-sdk") ||
              id.includes("ai") ||
              id.includes("agents")
            ) {
              return "ai-vendor";
            }
            if (
              id.includes("@radix-ui") ||
              id.includes("@phosphor-icons") ||
              id.includes("class-variance-authority") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            ) {
              return "ui-vendor";
            }
            if (id.includes("@aws-sdk")) {
              return "aws-vendor";
            }
            if (
              id.includes("marked") ||
              id.includes("react-markdown") ||
              id.includes("remark-gfm")
            ) {
              return "markdown-vendor";
            }
            if (
              id.includes("hono") ||
              id.includes("jose") ||
              id.includes("zod") ||
              id.includes("react-hot-toast")
            ) {
              return "utils-vendor";
            }
            // Put other node_modules in a vendor chunk
            return "vendor";
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000, // 1MB instead of default 500KB
  },
});
