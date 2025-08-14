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
  build: {
    rollupOptions: {
      external: ["cloudflare:email", "cloudflare:workers"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
});
