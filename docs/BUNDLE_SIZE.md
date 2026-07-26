# Bundle Size

How the client bundle is kept small, what the budget is, and how to investigate
a regression.

## Why it matters

The client is served from a Cloudflare Worker, and Workers enforce a **1 MB
compressed script size limit** on free plans. Beyond the hard limit, every
kilobyte in the initial chunk is parse-and-execute time before the app is
interactive — paid by every visitor, including those who never open the feature
that pulled the dependency in.

## The budget

"Initial JS" means the entry chunk referenced by `dist/client/index.html` plus
everything it reaches through **static** imports. Lazily-imported chunks are
excluded by design.

The budget lives in [`bundle-size-baseline.json`](../bundle-size-baseline.json)
and is enforced in CI by
[`scripts/check/check-bundle-size.mjs`](../scripts/check/check-bundle-size.mjs).

```bash
npm run bundle:size            # build + check against the budget
npm run bundle:size:baseline   # deliberately re-bless the budget
```

The gate runs two independent checks:

1. **Size ratchet** — fails if initial JS grows more than 5% past the baseline.
2. **Dependency denylist** — fails if `cytoscape`, `mammoth`, `pdfjs-serverless`,
   or `pdf-lib` appear in the initial set at all.

The denylist is the check that matters most. A byte budget tells you *that* the
bundle grew; the denylist tells you *why*, and it catches the specific
regression that keeps recurring (see below) before it eats the whole budget.

## Baseline (issue #488)

Measured with `npm run build`, gzipped byte counts:

| Chunk | Before | After |
|---|---:|---:|
| entry (`client-*.js`) | 4,311.3 kB raw / 1,227.6 kB gzip | 1,024.3 kB raw / 269.5 kB gzip |
| `vendor-*.js` (react, react-dom) | 189.6 kB raw / 59.0 kB gzip | 189.6 kB raw / 59.0 kB gzip |
| runtime | 1.3 kB raw / 0.7 kB gzip | 0.7 kB raw / 0.5 kB gzip |
| **initial JS total** | **4,502.2 kB raw / 1,287.3 kB gzip** | **1,214.6 kB raw / 329.5 kB gzip** |
| | | **−73.0% raw / −74.4% gzip** |

Emitted client chunks dropped from **39 to 5**. The 34 that disappeared were
server-side agent/tool modules (`base-agent`, `campaign-agent`, `search-tools`,
…) that were only reachable because of the leaks described below.

Deferred to on-demand chunks (downloaded only when the feature is used):

| Chunk | Size | Loads when |
|---|---:|---|
| `CytoscapeGraph-*.js` | 444.9 kB raw / 138.9 kB gzip | the graph canvas renders |
| `pdf-split-helper-*.js` | 420.6 kB raw / 175.2 kB gzip | an oversized PDF needs splitting |

`mammoth` and `pdfjs-serverless` are no longer emitted into the client build at
all — they are worker-only.

## What was actually wrong

Three distinct problems, only one of which was a missing dynamic import.

### 1. A hybrid module bridging client and server

`src/services/core/auth-service.ts` exports both browser helpers
(`getStoredJwt`, `authenticatedFetchWithExpiration`) and the server
`AuthService` class. Because the ES module is the unit of resolution, a
component importing *one* browser helper pulls in the module's entire import
list.

That list included `getAuthService` from `@/lib/service-factory` — which
imports `AuthService` straight back, forming a cycle. Through it the client
reached `LibraryRAGService` → `file-extraction-service` → `mammoth` +
`pdfjs-serverless`, and the whole agent/tool graph besides.

**Fix:** the per-env instance cache moved onto `AuthService.forEnv`, so
`auth-service` has no import edge back into the factory.
`ServiceFactory.getAuthService` delegates to it, so there is still exactly one
cache and behaviour is unchanged.

### 2. A barrel file re-opening the same bridge

Client code did `import { FileDAO } from "@/dao"` purely to read
`FileDAO.STATUS`. That constant is a re-export of `FILE_UPLOAD_STATUS`, a ~1 kB
module — but reaching it through the class forced the bundler to keep the class
and its `LibraryRAGService` import, and the `@/dao` barrel made the entire DAO
layer reachable at the same time.

**Fix:** client code imports `FILE_UPLOAD_STATUS` from
`@/lib/file/file-upload-status` directly.

> Using a class as a namespace for constants couples every consumer to that
> class's full dependency graph. Prefer the leaf module.

### 3. Genuinely eager heavy dependencies

- **`cytoscape`** — `GraphVisualizationModal` and `CommunityEntityView`
  imported `CytoscapeGraph` statically. They now use
  `LazyCytoscapeGraph`, a drop-in wrapper around `React.lazy` with its own
  `Suspense` boundary. The split is at the canvas rather than the modal so the
  modal's chrome (controls, entity detail panel) stays eager and opening it is
  still instant.
- **`pdf-lib`** — `useFileUpload` imported `pdf-split-helper` statically. The
  call site is already inside an `if (isPdf && tooLarge)` branch that emits a
  `splitting` progress event first, so the import moved to that branch and the
  user sees feedback while the chunk downloads.
- **`mammoth`** — now imported on demand inside
  `FileExtractionService.extractDocxText`, so Worker cold starts do not parse
  ~350 kB of DOCX parser that only DOCX uploads need.

## Diagnosing a regression

When the gate fails, find the import chain that reintroduced the dependency.
The failure message names the dependency; the usual culprits are the two
patterns above. Check whether the offending import is:

- a **value** (not `import type`) pulled from a barrel such as `@/dao`, or
- any import from a module that mixes browser and server code.

`import type` is erased at compile time and is always safe. Reaching for a
single constant or type through a class or a barrel usually is not.
