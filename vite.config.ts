import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      external: [
        "cloudflare:email",
        "cloudflare:workers",
        "node:fs",
        "node:path",
        "node:os",
        "node:crypto",
        "fs",
        "path",
        "os",
        "crypto",
      ],
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          ai: ["ai", "agents"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: "globalThis",
  },
});
