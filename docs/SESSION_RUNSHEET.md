# Session runsheet

One GM-facing, exportable page to actually run a session from. Implements
[issue #742](https://github.com/ofisk/loresmith-ai/issues/742).

LoreSmith already produces session plans, digests, handouts and planning tasks —
each in its own UI surface. A GM about to run a session needs several of them
*simultaneously*. The runsheet assembles them into a single printable document.

## What it is (and isn't)

- **Assembly, not generation.** Every input already exists in D1. Building a
  runsheet makes **no LLM calls** — it costs one round of database reads. See
  `RunsheetAssemblyService`.
- **A snapshot, not a live view.** Once generated, the content is frozen. The
  plan must not shift under the GM mid-session. Regenerating writes a new
  snapshot; hand-edits are persisted into the existing one and are never
  overwritten by re-assembly.
- **GM-only.** A runsheet is the campaign's secrets on one page. The
  player-safe equivalent is handouts.

## Composition

| Section | Assembled from |
| --- | --- |
| Recap | `last_session_recap` of the source session digest |
| This session's plan | `next_session_plan` of the source digest, plus open planning tasks scoped to this session (#699), plus the digest's `todo_checklist` |
| Cast | `npcs_to_run` from the digest, enriched with `npcs` entities (goals, quirks, role, secrets) |
| Encounters | `encounter_seeds` from the digest, enriched with `monsters` entities (CR/AC/HP/Speed) |
| Loot | `treasure_and_rewards` from the digest, enriched with `items` entities (rarity, text) |
| Rules to remember | Active house rules via `RulesContextService`, filtered to `source === "house"` |
| Open threads | `open_threads` from the digest, plus recent `hooks` entities |
| Notes | Freeform, always empty on generation; filled in by hand-editing |

### Choosing the source digest

A digest for session *N* holds both the recap **of** session *N* and the plan
**for** session *N+1*. So a runsheet for upcoming session *N* is fed by the
highest-numbered non-rejected digest **below** *N* — a single digest supplies
both the recap and plan sections.

### Name matching

Digest fields such as `npcs_to_run` and `encounter_seeds` are free text the GM
typed; they carry names, not entity ids. Name matching is therefore the only
available join, and it is deliberately forgiving:

- exact match on the normalized (lowercased, whitespace-collapsed) name, else
- the longest indexed entity name contained in the text.

Names shorter than 4 characters are never substring-matched — "Rat" or "Imp"
would match half the prose in a campaign. An unmatched name still appears on the
runsheet, just without enrichment, attributed to the digest rather than the graph.

Sections with nothing in them are listed in `emptySections` and rendered with an
explicit "nothing recorded" line. A silently omitted section reads as "nothing to
prepare" rather than "nothing recorded yet".

## Spoiler boundary

This is the critical design constraint of the feature.

- Every handler in `src/routes/runsheets.ts` gates on `requireCanSeeSpoilers`
  (read/export) or `requireCanEdit` (generate/update/delete). Both exclude the
  `editor_player` and `readonly_player` roles.
- Runsheets are **not** reachable through the player-facing share flow
  (`src/routes/campaign-share.ts`). Share links grant a player role; the role
  checks above reject it.
- The export endpoint carries no auth in its URL. The client fetches it with its
  bearer token and opens the result as a blob — so no spoiler-bearing link ever
  exists to leak. A token-in-URL export would have created exactly the shareable
  secret URL this feature must not have.
- The export response is sent `Cache-Control: no-store, private` and
  `X-Robots-Tag: noindex, nofollow`.

## Export

`GET /api/campaigns/:campaignId/runsheets/:runsheetId/export.html` returns a
standalone, print-friendly HTML document:

- fully self-contained — inline CSS, no scripts, no fonts, no external requests.
  A runsheet that needs wifi at the table defeats the point of printing it.
- `@page` margins and `break-inside: avoid` per section, so a statblock does not
  split across a page fold mid-combat.
- prep and checklist items render as `☐` checkboxes.

**PDF export is the browser's own "Print → Save as PDF."** Workers have no
headless-browser binding, and a print stylesheet gets the GM the same artifact
without shipping a PDF engine into the request path.

All rendered values pass through `escapeHtml` — runsheet content is entirely
user-authored prose.

## API

All routes require a user JWT. Roles as noted above.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/campaigns/:campaignId/runsheets` | edit | Generate a snapshot. Body: optional `sessionNumber`, `title`. Defaults to the campaign's next session number. |
| `GET` | `/campaigns/:campaignId/runsheets` | spoilers | List snapshots (summaries only — no body). Optional `?sessionNumber=`. |
| `GET` | `/campaigns/:campaignId/runsheets/:runsheetId` | spoilers | Get one snapshot with its full body. |
| `PUT` | `/campaigns/:campaignId/runsheets/:runsheetId` | edit | Persist hand-edits. Body: `title` and/or `runsheetData`. |
| `DELETE` | `/campaigns/:campaignId/runsheets/:runsheetId` | edit | Delete a snapshot. |
| `GET` | `/campaigns/:campaignId/runsheets/:runsheetId/export.html` | spoilers | Print-friendly HTML document. |

A runsheet id belonging to a different campaign answers `404`, not `403` — that
avoids confirming the runsheet exists to someone probing ids.

## Code map

| Concern | File |
| --- | --- |
| Types + snapshot validation | `src/types/runsheet.ts` |
| Persistence | `src/dao/runsheet-dao.ts`, `migrations/0028_campaign_runsheets.sql` |
| Assembly | `src/services/campaign/runsheet-assembly-service.ts` |
| Print rendering | `src/services/campaign/runsheet-html-service.ts` |
| Handlers | `src/routes/runsheets.ts` |
| Route registration | `src/routes/campaigns/runsheet-routes.ts` |
| UI | `src/components/session/RunsheetPanel.tsx` (Runsheet tab in `CampaignDetailsModal`) |

## Notes on the snapshot body

`validateRunsheetData` is deliberately **shallow on prose**: the GM is free to
rewrite any wording, but a document handed back missing a section (or with a
section of the wrong type) is rejected, because the renderer indexes into every
section. A stored snapshot that no longer parses raises rather than degrading to
an empty page — unlike a digest, there is no form to re-fill a runsheet from.
