## Deployment Notes

### Database migrations

Run migrations before deploying new code. The app is backwards compatible: if migrations 0013 or 0014 have not run, the code will degrade gracefully (e.g. no shared campaigns until 0013, no proposal attribution until 0014) rather than failing.

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
