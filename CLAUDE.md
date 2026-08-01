# LoreSmith AI

Cloudflare Workers + D1 + R2 + Vectorize backend, Vite/React frontend. Full dev setup: `docs/DEV_SETUP.md`.

## Running the app locally (no Cloudflare account needed)

Two processes, two terminals (or background them):

```bash
npm run dev     # backend: wrangler dev --local, port 8787 (wraps package.json script)
npm run start   # frontend: vite dev, port 5173, proxies /api to :8787
```

Requires `.dev.vars` to exist (copy from `.dev.vars.template` if missing — `ADMIN_SECRET` is the only required value for local dev).

Health checks:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/   # backend
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/   # frontend
```

Stop / free ports:
```bash
pkill -f "wrangler dev --config wrangler.local.jsonc"
pkill -f "vite dev"
# or, if a port is stuck:
lsof -ti:8787 | xargs -r kill
lsof -ti:5173 | xargs -r kill
```

Other dev targets (need a Cloudflare account + `CLOUDFLARE_ACCOUNT_ID`, already set in `.claude/settings.local.json`):
- `npm run dev:cloudflare` — backend against the real `-dev` Cloudflare resources (port 8787)
- `npm run deploy:dev` — deploy to the `loresmith-ai-dev` Worker

## Modal sizing

App content dialogs (resources, campaigns, notifications, shards, telemetry,
etc.) use exactly two sizes — don't introduce a third:

- `modal-size-md` ("Medium") — the default centered dialog. Use this unless
  the content is genuinely dashboard-dense.
- `modal-size-xl` ("Large") — near-fullscreen, for content-dense views
  (e.g. the telemetry dashboard) that need most of the viewport.

`modal-size-sm`/`modal-size-standard`/`modal-size-auth` still exist for a
handful of small transactional dialogs that predate this convention
(confirmations, auth, rate-limit/quota notices) — don't add new usages of
them, and don't add new one-off `modal-size-*` classes either.

## Testing

```bash
npm run test          # vitest unit tests
npm run test:e2e       # playwright e2e (needs npm run e2e:server running separately)
npm run check          # biome + import-path check + tsc
```
