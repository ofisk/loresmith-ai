# Feature flags (GitHub-managed)

Feature flags are **managed in GitHub** and baked into the app at build time. No extra service—just a JSON variable and a small helper in the app.

## Where to manage flags

1. **Repo variables (same flags for all deploys)**  
   **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**.

2. **Per-environment (different flags for staging vs prod)**  
   **Settings** → **Environments** → choose an environment (e.g. *production*) → **Environment variables** → **Add variable**.

Create a variable named **`FEATURES`** with a JSON object. Example:

```json
{"friends": true, "newDashboard": false}
```

- **`friends`**: when `true`, the app logs a one-time console greeting: "hey we're happy you're here" (handy for testing that flags are wired up.)

- Keys = flag names (use camelCase).
- Values = `true` or `false` only.

Change the value and re-run the deploy (or push to trigger the deploy workflow). New builds get the new flags.

## In the app

**Plain JS/TS:**

```ts
import { isFeatureEnabled, getFeatureFlags } from "@/lib/feature-flags";

if (isFeatureEnabled("newDashboard")) {
  // show new dashboard
}

// All flags (e.g. for debugging)
console.log(getFeatureFlags());
```

**React:**

```tsx
import { useFeatureFlag } from "@/lib/feature-flags-react";

function MyComponent() {
  const showNewDashboard = useFeatureFlag("newDashboard");
  return showNewDashboard ? <NewDashboard /> : <OldDashboard />;
}
```

## How it works

- The deploy workflow passes `vars.FEATURES` (or `'{}'` if unset) into the build as `VITE_FEATURES`.
- Vite bakes that string into the client bundle.
- `src/lib/feature-flags.ts` parses it and exposes `isFeatureEnabled(flag)` and `getFeatureFlags()`.

Flags are **build-time**: changing them in GitHub only takes effect after the next deploy. No runtime API calls.

## Preview deployments

If you use a PR preview workflow, pass the same variable so previews get the same (or overridable) flags, for example:

```yaml
- run: |
    VITE_API_URL=${{ steps.preview.outputs.preview_url }} \
    VITE_FEATURES='${{ vars.FEATURES || '{}' }}' \
    npm run build
```

## Example: user-specific behavior

To do something only for certain users, check the logged-in username (e.g. from `AuthService.getJwtPayload()?.username`) and branch in code.

Example in `app.tsx`: a `useEffect` runs when `username` is set and logs "hi you" to the console only for `aniham` and `ofisk`; no one else sees it.

## Optional: Worker (server) side

To use the same flags in your Cloudflare Worker (e.g. in API routes), add a build step that writes `vars.FEATURES` into a wrangler var (e.g. `FEATURES`) and read it from `env.FEATURES` in your Worker. The client-side helpers above are enough for UI-only flags.
