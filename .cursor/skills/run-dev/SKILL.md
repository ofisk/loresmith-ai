---
name: run-dev
description: Show how to run the development server and client in separate terminals. Use when the user asks how to start dev, run the app, or start development servers.
---

# Run development servers

## Terminal 1: Server

```bash
npm run dev:cloudflare
```

This runs `wrangler dev --config wrangler.dev.jsonc --port 8787`

## Terminal 2: Client

```bash
npm start
```

This runs the Vite dev server for the frontend.

## Done

Server runs on `http://localhost:8787`
Client runs on `http://localhost:5173`
