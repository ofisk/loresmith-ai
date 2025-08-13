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
    },
  },
  define: {
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      external: [
        "cloudflare:email",
        "cloudflare:workers",
        "async_hooks",
        "node:os",
        "path",
      ],
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
            return "vendor";
          }
          return null;
        },
      },
    },
  },
});
