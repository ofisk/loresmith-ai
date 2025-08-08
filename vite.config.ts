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
