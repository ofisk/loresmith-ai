# Database Migrations

How D1 schema changes get written, checked, and applied.

**Production migrations are automatic.** Merging to `main` applies pending
migrations and only then deploys the new Worker. Local and dev stay manual —
you run them yourself, as before.

## The two paths a schema change travels

Every schema change has to work on two very different databases, and they use
completely different mechanisms. Almost every migration bug in this repo comes
from forgetting the second one.

| | Existing database (prod, dev) | Fresh database (new local, new dev) |
|---|---|---|
| Built by | `wrangler d1 migrations apply` | `scripts/d1/d1-bootstrap.sql` |
| Reads | the new `migrations/*.sql` file | the full-schema snapshot |
| Journal | wrangler appends the filename | `d1-seed-d1-migrations.mjs` seeds **every** filename at once |

That second column is the trap. Bootstrap creates the schema and then marks
every migration file as already applied. So a table that exists **only** in a
migration file is recorded as applied but never created — `wrangler d1
migrations apply` afterwards says "No migrations to apply!" and the table is
simply absent. Nothing errors.

This has bitten the repo for real. See the comment at the top of
`migrations/0026_file_metadata_id_and_content_type.sql`: two columns missing
from hosted databases broke every library upload for weeks, and the failure
surfaced three layers away as "File metadata not found in database."

**So: a new migration must also be added to `scripts/d1/d1-bootstrap.sql`.**
CI now enforces this rather than trusting you to remember.

## Adding a migration

1. Create `migrations/NNNN_snake_case.sql`, taking the next free number.
2. Add the same schema to `scripts/d1/d1-bootstrap.sql` — tables, columns and
   indexes. Bootstrap is a snapshot of the *current* schema, not a history.
3. Apply it locally: `npm run migrate:local:apply`.
4. Rehearse what production will do: `npm run migrate:simulate`.
5. Verify the object actually exists before assuming it worked:

   ```bash
   npx wrangler d1 execute loresmith-db-dev --config wrangler.local.jsonc --local \
     --command="SELECT name FROM sqlite_master WHERE name='your_table';"
   ```

Never edit a migration that has already merged — see below.

## The CI gate

The `migrations` job in `.github/workflows/ci.yml` runs on every PR. It needs no
Cloudflare credentials: the static checks are git and SQL parsing, and the
simulation runs against a local Miniflare D1.

**Static checks** (`npm run migrate:check`), applied only to migrations this
branch adds, so existing files are grandfathered:

| Check | Why it is silent without the gate |
|---|---|
| Filename is `NNNN_snake_case.sql` | Wrangler orders and journals migrations by filename. |
| No duplicate sequence number | Two branches both adding `0033_*` merge with no git conflict, then apply in arbitrary order. |
| Already-merged migrations are unmodified | D1 journals by **name**. A file that ran once never runs again, so editing it reaches no deployed database, ever. |
| New tables/columns are in `d1-bootstrap.sql` | The fresh-database trap above. |
| Dropped tables are removed from `d1-bootstrap.sql` | Otherwise a fresh database resurrects a table you deleted. |

Missing indexes are reported as warnings, not failures — they cost performance
on a fresh database, not correctness.

**Apply simulation** (`npm run migrate:simulate`): rebuilds a local database as
it exists at `origin/main`, then applies only the migrations this branch adds —
exactly what production does on merge, using the same script the deploy command
runs. This is the only check that proves new SQL is valid against the **real
prior schema**; running migrations on an already-bootstrapped database cannot
tell you that, because bootstrap already marked the file applied.

The script refuses to run with uncommitted changes under `migrations/` or
`d1-bootstrap.sql`, because it rewrites those paths from the base ref.

## How production applies migrations

Cloudflare Workers Builds deploys `main`. Its **deploy command** is:

```
npm run deploy:prod:ci
```

which is:

```
node scripts/d1/ci-apply-migrations.mjs --config wrangler.jsonc \
  --database loresmith-db --remote && wrangler deploy --config wrangler.jsonc
```

Migrations run **before** `wrangler deploy`, so new code never starts against an
old schema, and a migration failure aborts the deploy via `&&`. Putting both in
one sequential command is what makes the ordering a guarantee — a separate CI
job racing Workers Builds on the same push would usually win, but "usually" is
not a guarantee.

`ci-apply-migrations.mjs` adds two things bare `wrangler d1 migrations apply`
does not give:

- **Preflight.** It proves the token can write to D1 before doing anything, and
  prints the exact fix if not.
- **Post-apply verification.** Every file in `migrations/` must have a row in
  `d1_migrations` afterwards. Wrangler has been observed exiting 0 while
  skipping migrations on a permission error
  ([workers-sdk#5077](https://github.com/cloudflare/workers-sdk/issues/5077));
  this turns that silence into a failed build.

A migration that fails is rolled back by Cloudflare, and earlier successful
migrations stay applied.

### One-time Cloudflare setup

**Workers Builds cannot run migrations under its default token.** The token it
creates for itself covers Account Settings (read), Workers Scripts, KV, R2 and
Workers Routes — but **not D1**. Two settings are needed, in
**Cloudflare dashboard → the `loresmith-ai` Worker → Settings → Builds**:

1. **Build secret** `CLOUDFLARE_API_TOKEN`, set to an API token with both:
   - Account → **D1** → Edit
   - Account → **Workers Scripts** → Edit
2. **Deploy command**: `npm run deploy:prod:ci` (build command stays `npm run build`).

Until both are set, the build fails on the preflight with instructions rather
than deploying against an unmigrated database.

## Local and dev

Unchanged and still manual.

```bash
npm run migrate:local:apply      # apply new migrations locally
npm run migrate:local:full       # bootstrap + apply (fresh local database)
npm run migrate:local:reset      # wipe local D1 and rebuild; local data loss is fine
npm run migrate:dev              # apply to the shared dev database (remote)
npm run migrate:bootstrap:dev    # once, for a brand-new dev database
```

Local drift — "duplicate column", `d1_migrations` out of sync — is expected
during development. `npm run migrate:local:reset` is the fix.

## Recovering production

Prefer the normal path: `npm run migrate:prod:apply`. Cloudflare rolls back a
failed migration and keeps prior state.

`npm run migrate:prod:apply:resilient` applies files one at a time and continues
past failures. It is for recovery from a broken migration state only. A
migration that partially applies and then errors leaves the database
inconsistent, and it will run again next time because no journal row is written.
Inspect failures and repair before re-running.

## Related

- `docs/DEPLOYMENT.md` — the deployment pipeline as a whole
- `docs/database/d1-indexes.md` — index strategy
- `docs/DAO_LAYER.md` — the data access layer over these tables
