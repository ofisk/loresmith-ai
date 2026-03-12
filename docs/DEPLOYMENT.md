## Deployment Notes

### Deployment pipeline

1. Developer works and tests locally.
2. Developer may optionally deploy to dev before opening a PR: `npm run deploy:dev`
3. Developer pushes and opens a PR; CI and sanity checks run automatically.
4. When checks pass, developer merges the PR to `main`.
5. On merge, the deploy workflow runs: deploy to dev first, then deploy to prod only if dev succeeds.

**Workflow (`.github/workflows/deploy.yml`):**
- **Deploy to staging** – Migrations run against `loresmith-db-dev`, then the dev Worker deploys.
- **Deploy to production** – Runs only after staging succeeds; migrations run against `loresmith-db`, then the production Worker deploys.

**Prerequisites:**
- Create `loresmith-db-dev` with `wrangler d1 create loresmith-db-dev` (or use `wrangler d1 list` to get the ID if it already exists), then update `wrangler.dev.jsonc` with the database ID.
- Create dev queues (Cloudflare Queues allow only one consumer per queue, so dev needs its own): `wrangler queues create upload-events-dev` and `wrangler queues create file-processing-dlq-dev`.
- For a fresh dev database, run `npm run migrate:bootstrap:dev` once, then `npm run migrate:dev` to apply incremental migrations. The deploy workflow runs bootstrap automatically before migrations for dev.

### Preview deployments (PR)

Each pull request can deploy a **preview Worker** so you can test the full app (FE + API) before merge.

**How it works:** One Worker serves both the SPA and the API (same origin). The workflow builds the frontend with `VITE_API_URL` set to the preview URL, then deploys a Worker with a unique name (e.g. `loresmith-ai-preview-123`). That Worker uses the **same dev D1, R2, Queues, and Vectorize** as staging—no per-PR databases or migrations. The workflow comments on the PR with the preview URL.

**Workflow:** `.github/workflows/deploy-preview.yml` runs on `pull_request` (opened, synchronize). It generates `wrangler.preview.generated.jsonc` from the template `wrangler.preview.jsonc` (placeholders `__PREVIEW_WORKER_NAME__` and `__PREVIEW_URL__`), builds with the correct API URL, deploys, and posts/updates a comment with the link.

**Required GitHub secrets (same as main deploy):**
- `CLOUDFLARE_API_TOKEN` – API token with Workers and D1 deploy permissions
- `CLOUDFLARE_ACCOUNT_ID` – Cloudflare account ID

**Optional:** `CLOUDFLARE_WORKERS_SUBDOMAIN` – Your account’s workers.dev subdomain (e.g. `oren-t-fisk`). If unset, the workflow uses `oren-t-fisk` so it works for this repo out of the box.

**Worker secrets:** Each preview Worker is a new script (e.g. `loresmith-ai-preview-123`) and starts with no secrets. To make auth work on previews, either add a GitHub secret `PREVIEW_JWT_SECRET` (the workflow will set `JWT_SECRET` for the Worker) or set any required secrets (e.g. `JWT_SECRET`) in the Cloudflare Dashboard for each new preview Worker (once per PR number).
**Trade-offs:** Previews share dev data (D1, R2). That’s fine for smoke-testing and demos; for isolated data per PR you’d need to create a D1 database (and optionally R2 prefix) per PR and run migrations in the workflow.

---

**Required GitHub secrets:**
- `CLOUDFLARE_API_TOKEN` – API token with Workers and D1 deploy permissions
- `CLOUDFLARE_ACCOUNT_ID` – Cloudflare account ID

**How to add GitHub secrets (copy/paste):**

1. **Open the repo on GitHub** → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** for each of these:

   | Secret name | Where to get the value |
   |-------------|------------------------|
   | `CLOUDFLARE_ACCOUNT_ID` | [Cloudflare Dashboard](https://dash.cloudflare.com) → right-hand sidebar under "Account ID", or **Workers & Pages** → any Worker → the ID is in the URL or in the overview. Copy the 32-character hex string. |
   | `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com) → **My Profile** (top right) → **API Tokens** → **Create Token**. Use "Edit Cloudflare Workers" template or create a custom token with **Account** → **Cloudflare Workers Scripts** (Edit) and **Account** → **D1** (Edit). Create the token, then **Copy** the value (you only see it once). |
   | `PREVIEW_JWT_SECRET` (optional) | Generate one: run `openssl rand -hex 32` in a terminal and paste the output. Or reuse the same secret you use for dev (e.g. from `wrangler secret list --config wrangler.dev.jsonc` you can’t see the value; set a new one and use it here). |
   | `CLOUDFLARE_WORKERS_SUBDOMAIN` (optional) | After your first deploy, the Worker URL looks like `https://loresmith-ai-dev.XXXX.workers.dev`. The `XXXX` part is your subdomain (e.g. `oren-t-fisk`). Paste that. If you don’t set this, the preview workflow uses `oren-t-fisk`. |

3. Paste each value into the **Secret** field and click **Add secret**. You won’t be able to see the values again; you can update a secret by creating a new one with the same name.

**Required Worker secrets (dev and prod):** Set these in the Cloudflare Dashboard (Workers & Pages → your-worker → Settings → Variables and Secrets) or via `wrangler secret put`:
- `JWT_SECRET` – Secret for signing/verifying auth tokens. Without this, login and API auth return 500/401. To set for dev: `wrangler secret put JWT_SECRET --config wrangler.dev.jsonc`

**Optional (for username/password auth and email verification):** Set these as **secrets** the same way:
- `RESEND_API_KEY` – Resend API key for verification emails. Without this, registration succeeds but no verification email is sent; users see a message directing them to use "Resend verification email" or contact support. To set for dev: `wrangler secret put RESEND_API_KEY --config wrangler.dev.jsonc`

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

**New databases:** Run `npm run migrate:bootstrap:dev` (or `migrate:bootstrap:prod`) once to create the base schema. Then run `npm run migrate:dev` or `wrangler d1 migrations apply` to apply incremental migrations. The bootstrap script is separate because the clean-slate schema contains triggers that cause D1's migration runner to fail (semicolon-splitting).

**Existing databases:** Run migrations before deploying new code. The app is backwards compatible: if migrations 0013 or 0014 have not run, the code will degrade gracefully (e.g. no shared campaigns until 0013, no proposal attribution until 0014) rather than failing.

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
