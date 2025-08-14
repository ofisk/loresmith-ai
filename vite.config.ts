import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  ssr: {
    noExternal: ["agents", "ai"],
  },
  build: {
    rollupOptions: {
      external: [
        "cloudflare:email",
        "cloudflare:workers",
        "node:fs",
        "node:path",
        "node:os",
        "node:crypto",
        "node:async_hooks",
        "node:events",
        "node:util",
        "node:buffer",
        "node:stream",
        "node:url",
        "node:querystring",
        "node:http",
        "node:https",
        "node:net",
        "node:tls",
        "node:zlib",
        "node:fs",
        "path",
        "os",
        "crypto",
        "async_hooks",
        "events",
        "util",
        "buffer",
        "stream",
        "url",
        "querystring",
        "http",
        "https",
        "net",
        "tls",
        "zlib",
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
