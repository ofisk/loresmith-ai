# Cyclomatic Complexity Gate

Every commit is checked against a cyclomatic complexity budget so the codebase
cannot silently accumulate functions that are too branchy to test or reason
about. The check is powered by [lizard](https://github.com/terryyin/lizard).

## Setup

lizard is a Python tool, so it is not installed by `npm install`:

```bash
python3 -m pip install --user lizard
```

Without it the pre-commit hook fails with install instructions.

## The threshold

**Functions must stay at or below CCN 15.** Cyclomatic complexity counts the
independent paths through a function: 1, plus one for every `if`, `for`,
`while`, `case`, `catch`, `&&`, `||`, and ternary. It approximates the number of
tests needed for full branch coverage.

CCN 15 is lizard's own default and sits just above this repo's 95th percentile
(12), so it flags genuine sprawl without fighting ordinary request handlers.

## The ratchet

The repo had 135 functions over the threshold when the gate was introduced.
Rather than block all work behind a mass refactor, those are recorded in
`complexity-baseline.json` and grandfathered in.

The check fails when:

- a **new** function exceeds the threshold,
- an **existing** baselined function gets **more** complex,
- a file gains **more** over-threshold functions sharing a name than the
  baseline allows (this is how anonymous callbacks are tracked).

Complexity can therefore only go down. Baseline entries are keyed by
`file::functionName` rather than line number so that unrelated edits above a
function do not produce false positives.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run complexity` | Check the whole repo against the baseline. Runs in CI. |
| `npm run complexity:staged` | Check only staged files. Runs in the pre-commit hook. |
| `npm run complexity:report` | List every function over CCN 15, worst first. |
| `npm run complexity:baseline` | Regenerate the baseline. |

Set `COMPLEXITY_CCN` to override the threshold for a single run.

## When the check fails

Fix the function rather than raising the budget. Common moves:

- Extract each cohesive phase of a long function into a named helper.
- Replace long `if`/`else if` chains over a single value with a lookup table.
- Push per-item branching into a function that handles one item.
- Return early instead of nesting.

`npm run complexity:baseline` exists for paying down debt, not for absorbing new
violations. After you reduce complexity in a baselined function, `npm run
complexity` reports how many entries improved — regenerate the baseline in that
same commit to lock in the gain.

## Worked example

`searchCampaignContext`'s `execute` was a single 955-line function at CCN 195.
Extracting result shaping into `search-tools-result-shaping.ts` and graph
traversal into `search-tools-graph-traversal.ts` brought it to 768 lines at
CCN 154, and made both extracted modules unit-testable in isolation. It remains
baselined; further decomposition is tracked separately.
