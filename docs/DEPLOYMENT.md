## Deployment Notes

### Deployment pipeline

1. Developer works and tests locally.
2. Developer may optionally deploy to dev before opening a PR: `npm run deploy:dev` (runs bootstrap, D1 migrations for dev, and `wrangler deploy --config wrangler.dev.jsonc`).
3. Developer pushes and opens a PR; CI and sanity checks run automatically.
4. When checks pass, developer merges the PR to `main`.
5. **Production:** Cloudflare **Workers Builds** (GitHub integration on the `loresmith-ai` Worker) builds and deploys from `main`. Configure build env vars, install/build commands, and any deploy steps in the Cloudflare dashboard so they match this repo (see `package.json` scripts and previous `deploy.yml` logic for D1 migrations if you run them in CI).

There is **no** separate GitHub Actions `deploy.yml` for production—Cloudflare’s integration is the source of truth for prod deploys from `main`.

**Prerequisites:**
- Create `loresmith-db-dev` with `wrangler d1 create loresmith-db-dev` (or use `wrangler d1 list` to get the ID if it already exists), then update `wrangler.dev.jsonc` with the database ID.
- Create dev queues (Cloudflare Queues allow only one consumer per queue, so dev needs its own): `wrangler queues create upload-events-dev`, `wrangler queues create file-processing-dlq-dev`, `wrangler queues create graph-rebuild-dlq-dev`, `wrangler queues create shard-embedding-dlq-dev`. Or run `./scripts/dev/setup-dev.sh` which creates these.
- For production, ensure DLQ queues exist: `wrangler queues create graph-rebuild-dlq` and `wrangler queues create shard-embedding-dlq` (file-processing-dlq is created with main queues).
- For a fresh dev database, run `npm run migrate:bootstrap:dev` once (applies `d1-bootstrap.sql` and records existing migration files in `d1_migrations`), then `npm run migrate:dev` whenever you pull new migrations. `npm run deploy:dev` runs bootstrap before migrations for dev.

**GitHub secrets:** none required. CI (`ci.yml`, `sanity-check.yml`) uses only the built-in `GITHUB_TOKEN`, and the production deploy from `main` runs through **Cloudflare Workers Builds**, which authenticates via the Cloudflare–GitHub integration rather than repository secrets.

**Required Worker secrets (dev and prod):** Set these in the Cloudflare Dashboard (Workers & Pages → your-worker → Settings → Variables and Secrets) or via `wrangler secret put`:
- `JWT_SECRET` – Secret for signing/verifying auth tokens. Without this, login and API auth return 500/401. To set for dev: `wrangler secret put JWT_SECRET --config wrangler.dev.jsonc`

**Optional (for username/password auth and email verification):** Set these as **secrets** the same way:
- `RESEND_API_KEY` – Resend API key for verification emails. Without this, registration succeeds but no verification email is sent; users see a message directing them to use "Resend verification email" or contact support. To set for dev: `wrangler secret put RESEND_API_KEY --config wrangler.dev.jsonc`

**Optional (for generated ambience, sound effects, and theme music):** Set these as **secrets** the same way. See [Generated audio](GENERATED_AUDIO.md).
- `ELEVENLABS_API_KEY` – External sound/music model, reached through AI Gateway. Without it, NPC voices and creature sounds still work (they run on the Workers AI binding), but ambience, sound effects, and music report as unavailable in the UI with the reason. Nothing errors. To set for dev: `wrangler secret put ELEVENLABS_API_KEY --config wrangler.dev.jsonc`
- `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_ID` – Identify the AI Gateway the audio calls route through. **Required alongside the key** — the key on its own does nothing, because without both the provider stays inactive so no request can bypass the gateway. Create the gateway at Cloudflare dashboard → AI → AI Gateway; both ids appear in its API endpoint URL.
- `AUDIO_VOICE_PROVIDER` *(optional)* – Setting the key above also moves NPC voice onto ElevenLabs, which bills per character on the highest-volume kind. Set this to `workers-ai` to keep voice on the free first-party model.

**Dev Worker URL:** `https://loresmith-ai-dev.<account-subdomain>.workers.dev` (e.g. `https://loresmith-ai-dev.oren-t-fisk.workers.dev`). Check the Cloudflare dashboard or deploy logs for your exact URL.

Staging uses a dedicated D1 database (`loresmith-db-dev`). R2 and Vectorize are shared with production.

### Stripe (billing)

**Dev uses Stripe test mode; prod uses live mode.** Test mode never charges real money. Use test keys (`sk_test_...`), test price IDs, and a test webhook secret for the dev Worker.

**Obtaining test keys and price IDs:**
1. In the [Stripe Dashboard](https://dashboard.stripe.com), enable **Test mode** (toggle top-right).
2. **API keys:** Developers → API keys → copy the Secret key (`sk_test_...`).
3. **Products and prices:** Create products for Basic (monthly, annual), Pro (monthly, annual), and indexing credit packs (50K, 200K, 500K). Copy each price ID (`price_...`).
4. **Webhook:** Developers → Webhooks → Add endpoint:
   - URL: `https://loresmith-ai-dev.<account-subdomain>.workers.dev/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the Signing secret (`whsec_...`).

**Dev Worker secrets:** Set via Cloudflare Dashboard or `wrangler secret put --config wrangler.dev.jsonc`:
- `STRIPE_SECRET_KEY` – Test secret key
- `STRIPE_WEBHOOK_SECRET` – Signing secret from the dev webhook endpoint
- `STRIPE_PRICE_BASIC_MONTHLY`, `STRIPE_PRICE_BASIC_ANNUAL`
- `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_INDEXING_CREDITS_50K`, `STRIPE_PRICE_INDEXING_CREDITS_200K`, `STRIPE_PRICE_INDEXING_CREDITS_500K`

**Local development:** Add the same Stripe test values to `.dev.vars` (see `.dev.vars.template`). For local webhook testing, use Stripe CLI: `stripe listen --forward-to localhost:8787/api/billing/webhook` and use the temporary signing secret it prints. For simpler testing, use the deployed dev Worker.

**Test card:** Use `4242 4242 4242 4242`, any future expiry (e.g. `12/34`), any CVC.

### Database migrations

**New databases:** Run `npm run migrate:bootstrap:dev` (or `migrate:bootstrap:prod`) once. That applies `scripts/d1/d1-bootstrap.sql` (full current schema, including triggers via the shell wrapper) and **baselines** `d1_migrations` with every file already in `migrations/`, so `wrangler d1 migrations apply` does not replay history. After that, run `npm run migrate:dev` (or prod apply) whenever someone adds a **new** migration file—Wrangler applies only those.

**Existing databases:** Run `wrangler d1 migrations apply` (e.g. `npm run migrate:dev` / `migrate:prod:apply`) before or as part of deploy so each environment catches up. Migration SQL stays incremental and real; bootstrap is the fast path for an empty D1.

**Local migration drift (duplicate column, `d1_migrations` out of sync, etc.):** Local D1 data loss is acceptable. Run `npm run migrate:local:reset` — it deletes Miniflare’s local D1 files under `.wrangler/state/v3/d1`, then runs bootstrap (schema + `d1_migrations` baseline) and `wrangler d1 migrations apply` so you match the repo again. If anything still looks wrong with local persistence, stop `wrangler dev`, remove the whole `.wrangler/state` directory, then run `migrate:local:reset` again.

**Note:** This repo’s historical migrations assume core tables from `d1-bootstrap.sql` (or an already-migrated database). Do not expect `wrangler d1 migrations apply` alone on a totally empty database to succeed from migration `0000` without bootstrap—use bootstrap first, then apply for new files.

### Cloudflare build cache

Cloudflare Pages restores previous `dist/` and `.wrangler` artifacts between builds.  
After renaming or moving modules (e.g. switching from `content-types` to `entity-types`), those cached bundles can
cause the build step to fail.

To force a clean build locally or in CI:

```bash
npm run clean && vite build --force
```

The `clean` script removes cached Wrangler output and the Vite build directory, ensuring the next build generates fresh
artifacts. If the Cloudflare auto-build fails after structural changes, rerun it with this clean step.
