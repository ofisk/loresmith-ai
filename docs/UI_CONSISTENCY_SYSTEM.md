# UI consistency system (proposal)

**Status:** Draft proposal, not yet adopted. Filed as a PR for discussion —
see [CONTRIBUTING.md](CONTRIBUTING.md) for how to comment/approve.

## Problem statement

The frontend already has the beginnings of a design system — Tailwind v4
with a CSS-first token layer (`src/styles.css`), a small set of shared
components (`Button`, `Modal`, `Card`), and a documented two-size modal
convention in `CLAUDE.md`. But nothing stops a screen from bypassing it, and
in practice screens drift:

- **Brand color drift.** `--color-primary` exists as the one lavender token,
  but 18 files still reach for stock Tailwind `purple-600`/`purple-400`/etc
  directly (44 occurrences) instead of `text-primary`/`bg-primary`. Two of
  these were shipped as visibly-different shades of "brand purple" in the
  same sidebar before being caught by eye and fixed.
- **Size drift.** Modal dialogs organically grew a third and fourth
  `modal-size-*` variant before being consolidated down to two
  (`modal-size-md`, `modal-size-xl`) — see the "Modal sizing" section of
  `CLAUDE.md`. That fix was reactive, not enforced; nothing stops a fifth
  size from appearing.
- **Interaction-state drift.** Disabled buttons across the app used
  `cursor-not-allowed`, which (depending on OS cursor-size settings) renders
  a jarring oversized "blocked" cursor and still allows CSS `:hover` states
  to visually fire on an element the user can't actually interact with. This
  shipped identically in at least two independent places (`Button.tsx`'s
  `formBaseClass` and the `.add-disable` CSS class) before being caught.
- **One-off UI patterns.** A one-off "Edit → Save/Cancel" toggle pattern
  existed on exactly one screen (campaign details) and nowhere else in the
  app, with no shared component backing it — every future editable-fields
  screen would have had to reinvent (or diverge from) it.

None of these were caused by Tailwind. They were caused by there being no
single point where "this is the app's list of valid buttons/colors/sizes"
lives *and is enforced*. Right now that knowledge lives in the eyes of
whoever last looked closely at the screen in question.

## Goals

1. **Consistency first.** The same kind of screen (list view, detail modal,
   confirmation, form) should look and behave the same way everywhere,
   without a human having to notice and fix drift after the fact.
2. **Enforcement over documentation.** A rule that only lives in a Markdown
   file gets forgotten. Prefer a rule a script or the type system can catch.
3. **Then, "magical."** Once consistency is structurally guaranteed, invest
   in shared motion/polish (transitions, hover/press feedback, loading
   states) applied *inside* the shared components, so every screen gets the
   polish for free instead of being hand-tuned per screen.

## Non-goals

- Not a rewrite. No component library swap (no Radix/MUI/shadcn migration
  as a blanket replacement) and no new CSS framework. Tailwind v4 +
  CSS-first tokens stay.
- Not a visual redesign. Existing colors, spacing, and component look stay
  as-is; this proposal is about *guaranteeing* the existing look is applied
  uniformly, not changing what the look is.
- Not a big-bang migration. Existing screens are grandfathered (like
  `complexity-baseline.json` already does for the complexity gate) and
  brought into compliance incrementally, not in one PR.

## Recommendation summary

Keep Tailwind as the styling engine. Fix consistency at three layers:

1. **Tokens** — extend the existing CSS custom-property layer
   (`src/styles.css` already has width/height/radius/z-index/size/motion
   tokens; only `--color-primary` exists for brand color) to cover the
   states that currently leak into ad hoc utility classes: hover/active
   variants of brand color, destructive color, disabled state.
2. **Components** — the existing `Button`/`Modal`/`Card` components become
   the *only* sanctioned way to get brand styling; screens compose props,
   not raw `className` overrides for anything token-covered.
3. **Enforcement** — a small standalone check script (same shape as
   `scripts/check/check-complexity.mjs`, ratcheted against a baseline file
   so existing violations are grandfathered but new ones fail CI) that
   flags raw Tailwind color utilities outside the token/component files.

Headless primitives (Radix UI or Base UI) are worth adopting *only* for the
genuinely fiddly interactive widgets (dropdown/popover/dialog positioning,
focus trapping) where this repo has already hit real bugs this way (the
`backdrop-filter` containing-block issue that broke portal-less popups). Not
a wholesale swap — just where hand-rolled behavior has already caused a bug.

## Phased plan

Each phase should ship as its own PR, pass the standard checks
(`npm run check`, `npx vitest run`), and not change any screen's visual
behavior except where explicitly noted.

### Phase 0 — Audit (no code changes to app behavior)

Produce an inventory, checked into `docs/`, of:
- every raw Tailwind color utility in `src/` that duplicates a design
  concept `--color-primary` or `.add-disable` already covers (start from
  the 44 known `purple-*` occurrences and extend to `red-*`/other
  semantic colors used for destructive/success/warning states)
- every distinct `modal-size-*`/button-variant/badge-style combination in
  use today, so the "finite set" in the next phase is grounded in reality,
  not guessed

**Test steps:**
- Audit script (if written) has its own unit test asserting it finds the
  known 44 `purple-*` occurrences as a regression check
- No `src/` behavior changes in this phase, so `npx vitest run` and
  `npm run check` must be a no-op diff (nothing beyond the audit script
  itself and its output doc)

### Phase 1 — Token coverage

Add the missing tokens identified in Phase 0 (e.g.
`--color-primary-hover`, `--color-destructive`,
`--color-destructive-hover`) to `src/styles.css` alongside the existing
ones. Additive only — no consumer migrated yet.

**Test steps:**
- `npx tsc --noEmit` and `npm run check` pass (pure CSS addition)
- Manually verify in the browser that adding the tokens doesn't change any
  existing rendered page (nothing consumes them yet)
- `npx vitest run` full suite green (no behavior touched)

### Phase 2 — Component API hardening

Migrate the known `purple-*`/`red-*` call sites from Phase 0's inventory to
the token-backed classes (`text-primary`, a new `variant="destructive"` on
`Button`, etc.), a batch at a time. Extend `Button`/`Modal`/`Card` variant
props if a real, recurring pattern from the audit isn't covered yet (e.g. a
shared "confirm delete" pattern, since `ConfirmDeleteButton` already exists
as a bespoke one-off — fold it into `Button` as a variant if the audit shows
more than one screen needs it).

**Test steps:**
- Per batch: `npx tsc --noEmit` (prop-type changes on shared components
  will surface every call site that needs updating — treat compiler
  errors as the migration checklist)
- Visual smoke check per migrated screen (local dev, both light/dark theme)
  comparing before/after screenshots — no visual diff expected
- `npx vitest run` full suite green after each batch
- `node scripts/check/check-complexity.mjs` stays green (component prop
  surface shouldn't blow up branching in the shared components themselves —
  extract sub-components the same way `CampaignDetailsActions` was
  extracted from `CampaignDetailsModal` if it does)

### Phase 3 — Enforcement gate

Write `scripts/check/check-design-tokens.mjs`: greps/AST-walks `src/**/*.tsx`
for raw color utilities (`bg-purple-*`, `text-red-*`, etc.) outside an
allowlist (the token/component definition files themselves), writes a
baseline file (`design-tokens-baseline.json`) of remaining violations at
adoption time, and fails CI only on *new* violations — same ratchet pattern
as `complexity-baseline.json`. Wire into `npm run check` and the pre-commit
hook (`lint-staged`), matching how `complexity:staged` is already wired.

**Test steps:**
- Pipe-test the raw script against a few real files before wiring it in
  (same verification approach used for hook construction: synthesize
  input, confirm exit code and output)
- Baseline-generation mode run once, diffed by a human against Phase 0's
  audit for sanity (counts should roughly match)
- Deliberately introduce a new raw-color violation in a scratch branch,
  confirm the gate fails; remove it, confirm the gate passes — proves the
  ratchet actually ratchets
- Confirm the gate does *not* flag the allowlisted token/component files
  themselves (false-positive check)
- Full `npm run check` + `npx vitest run` still green with the new script
  wired into the pipeline

### Phase 4 — Shared motion/polish ("magical")

Only after Phase 3 is merged and green. Add a small shared transition/motion
layer (Tailwind `transition-*` utilities used consistently, or a minimal
motion primitive) *inside* `Button`/`Modal`/`Card` for hover, press, and
enter/exit states — not per-screen animation code.

**Test steps:**
- Manual visual QA pass across the key screen types (list, detail modal,
  confirmation, form) in both themes
- Explicit `prefers-reduced-motion` check: verify animations are
  suppressed/reduced when the OS setting is on (accessibility requirement,
  not optional)
- `npx vitest run` green — motion changes shouldn't affect component logic
  tests, which is itself a signal the animation is properly isolated to
  presentation

### Phase 5 — Docs + rollout

Update `CLAUDE.md` with the finalized token/component rules (generalizing
the existing "Modal sizing" section pattern to buttons/colors/motion).
Update `docs/CONTRIBUTING.md` to point new-screen authors at the
token/component set before they reach for raw Tailwind. Sweep remaining
Phase 0 inventory items not yet migrated in Phase 2, batch by batch, now
that the Phase 3 gate prevents regression.

**Test steps:**
- Full regression pass: `npm run check`, `npx vitest run`,
  `npm run test:e2e` (needs `npm run e2e:server` running separately)
- Final `design-tokens-baseline.json` diffed to confirm it's empty (or has
  a small, explicitly-justified remainder) before calling rollout complete

## Open questions for PR discussion

- Should the enforcement gate (Phase 3) be a hard CI failure or a
  warning-only period first, given `complexity:staged`'s gate is already a
  hard pre-commit block?
- Is `ConfirmDeleteButton` (currently its own component, not a `Button`
  variant) worth folding in during Phase 2, or is destructive-confirm
  common enough elsewhere to justify staying separate?
- Scope of Phase 4's headless-primitives adoption (Radix/Base UI) — worth
  scoping to a specific widget (e.g. the user-menu dropdown, which already
  has a hand-rolled portal-positioning workaround) as a pilot before wider
  adoption?
