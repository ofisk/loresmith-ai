# Player recap emails

Between-session recaps mailed to a campaign's players, generated from a session
digest and **always** reviewed by the GM before sending. Issue
[#745](https://github.com/ofisk/loresmith-ai/issues/745).

## Why the design is shaped this way

An email cannot be recalled. Every design decision below trades convenience for
the guarantee that nothing reaches players without a GM looking at it first.

There is deliberately **no** automatic path from "digest created" to "email
sent". Enabling recaps for a campaign does not schedule anything; it only makes
the send action available.

## Flow

1. **Opt in** — the GM enables recaps per campaign (Campaign details → Session
   digests). Off by default; a campaign never gains an outbound email path
   without an explicit toggle.
2. **Generate** — the GM opens the review modal for a digest. The server reduces
   the digest to its player-safe subset and writes a markdown **draft**.
3. **Review and edit** — the GM edits subject and body, sees the exact recipient
   list, and sees any advisory spoiler flags.
4. **Send** — one explicit, confirmed action. The draft is claimed atomically,
   then mailed to eligible players.
5. **Unsubscribe** — every email carries a per-player link and
   `List-Unsubscribe` headers.

## Spoiler safety

### The allowlist

`src/lib/player-recap/player-safe-digest.ts` reads **only** fields under
`last_session_recap` — content describing what already happened at the table,
which the players were present for:

| Included                         | Becomes                 |
| -------------------------------- | ----------------------- |
| `last_session_recap.key_events`   | What happened           |
| `state_changes.npcs`              | Who you met             |
| `state_changes.locations`         | Where you went          |
| `state_changes.factions`          | Word around the world   |
| `last_session_recap.open_threads` | Loose ends              |

Everything else in `SessionDigestData` has no representation in
`PlayerSafeRecap` at all: `next_session_plan.*` (objectives, beats, branches,
predicted player goals), `npcs_to_run`, `locations_in_focus`, `encounter_seeds`,
`clues_and_revelations`, `treasure_and_rewards`, `todo_checklist`.

This is an allowlist, not a denylist, and that distinction is the point.
`sanitizeDigestForPlayer` in `src/routes/session-digests.ts` blanks two
known-unsafe fields and passes the rest through — fine for an in-app view the GM
can correct, wrong for an email. With a denylist, any field added to
`SessionDigestData` later would ship to players before anyone noticed. A test in
`tests/lib/player-safe-digest.test.ts` asserts exactly that case.

### Spoiler flags are advisory, not a filter

The allowlist bounds *which fields* are read. It cannot tell whether a GM wrote
an off-screen development into `state_changes` ("the cult secretly relocated").

`flagPotentialSpoilers` matches phrases that suggest player-unknown content
("secretly", "unbeknownst", "true identity", "twist", …) and surfaces the
matching lines in the review UI. **Nothing is removed.** Silently deleting lines
would give the filter an authority it has not earned and would mangle
legitimate prose; the honest move is to point the reviewer at the risky lines
and let them decide.

## Recipients

Players are resolved from `campaign_members` (roles `editor_player` and
`readonly_player`) joined to `users.email`. GM-role members and the campaign
owner are excluded — they ran the session.

A player is eligible only when all of these hold:

| Requirement                     | Excluded reason    |
| ------------------------------- | ------------------ |
| Account has an email             | `no_email`         |
| `users.email_verified_at` is set | `email_unverified` |
| Not unsubscribed                 | `unsubscribed`     |

Unverified addresses are excluded on purpose: an unverified address has not been
confirmed to belong to the person who typed it, so mailing it is both a consent
problem and a deliverability one.

The review UI shows every exclusion and its reason, so the GM knows the exact
audience before confirming.

### Consent model: opt-out, by decision

Players are **not** asked to opt in. The address used is their LoreSmith account
email, collected at signup (`src/routes/auth.ts` — password register, or Google
OAuth), and by the time anyone can be a campaign member it is verified: the
password path blocks login until verification, and the Google path marks it
verified at signup.

A per-player opt-in checkbox at campaign-join time was considered and
deliberately rejected. The unsubscribe link in every email is the consent
control, on the reasoning that this is low-volume mail from a GM the player
already knows and plays with, and a join-time checkbox mostly adds friction to
the flow that gets players into a campaign.

That places real weight on unsubscribe working correctly, which is why
`tests/dao/player-recap-dao.test.ts` runs the unsubscribe path against real
SQLite rather than a mocked D1 — see "Unsubscribe" below.

## Send guarantees

- **Single-flight.** `claimForSend` runs
  `UPDATE ... SET status='sent' WHERE id=? AND status='draft'` and checks D1's
  `meta.changes`. Only the caller that flipped the row proceeds. A
  read-then-write check would let two concurrent clicks both pass and mail the
  party twice.
- **Sent recaps are immutable.** Editing and regenerating both refuse once
  `status = 'sent'`.
- **Partial success stays sent.** If some deliveries fail, the recap remains
  `sent` so a retry cannot re-mail players who already received it. Only a total
  failure moves to `failed`, which the GM can return to `draft` via the retry
  endpoint.
- **Pending edits are saved before sending**, so what goes out is what the GM
  was looking at.

## Unsubscribe

`GET|POST /recap-unsubscribe/:token` — public, unauthenticated, outside `/api`;
it is opened straight from an email client by someone who may have no LoreSmith
session. Authorised by an unguessable per-(campaign, player) token.

Tokens are stable, so unsubscribe links in older emails keep working. POST is
registered for the `List-Unsubscribe-Post: List-Unsubscribe=One-Click` flow that
Gmail and Outlook use — surfacing native unsubscribe keeps recipients out of the
"mark as spam" path, which protects the sending domain's reputation.

The unsubscribe link is added by the renderer, not stored in the editable body,
so a GM cannot remove it while editing.

Because unsubscribe is the only consent control, these properties are covered by
tests running against real SQLite (`tests/dao/player-recap-dao.test.ts`) — a
mocked D1 cannot exercise any of them:

- Unsubscribing excludes the player from every later send.
- A later send does **not** undo an unsubscribe. `ensureUnsubscribeToken` uses
  `ON CONFLICT DO NOTHING`, so re-running it for an existing row is inert.
- The token does not rotate, so links in older emails keep working.
- Repeat unsubscribes are idempotent, so a duplicated one-click POST is safe.
- Unsubscribing is scoped to one campaign, not the player's whole account.

## Schema

Migration `migrations/0029_player_recap_emails.sql`:

| Table                          | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `campaign_recap_settings`      | Per-campaign opt-in; absent row means disabled        |
| `campaign_recap_emails`        | One reviewable draft per digest (unique `digest_id`)  |
| `campaign_recap_deliveries`    | Per-recipient outcome of one send                     |
| `campaign_recap_subscriptions` | Per-player unsubscribe state and stable token         |

## API

All campaign routes require GM edit rights (owner or `editor_gm`).

| Method     | Path                                                              |
| ---------- | ----------------------------------------------------------------- |
| `GET/PUT`  | `/api/campaigns/:campaignId/player-recaps/settings`                |
| `GET`      | `/api/campaigns/:campaignId/player-recaps/recipients`              |
| `GET`      | `/api/campaigns/:campaignId/player-recaps`                         |
| `POST`     | `/api/campaigns/:campaignId/session-digests/:digestId/player-recap` |
| `GET/PUT`  | `/api/campaigns/:campaignId/player-recaps/:recapId`                |
| `POST`     | `/api/campaigns/:campaignId/player-recaps/:recapId/send`           |
| `POST`     | `/api/campaigns/:campaignId/player-recaps/:recapId/retry`          |
| `GET/POST` | `/recap-unsubscribe/:token` (public)                               |

Notable status codes: `409` recaps disabled / already sent / not editable;
`422` nothing player-safe to send or no eligible recipients.

## Configuration

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `RESEND_API_KEY`          | Required to send; absent means the send endpoint errors   |
| `RECAP_EMAIL_FROM`        | From address for recaps                                   |
| `VERIFICATION_EMAIL_FROM` | Fallback when `RECAP_EMAIL_FROM` is unset                 |

Recaps are bulk-ish and player-directed, unlike the existing transactional auth
mail. Using a separate `RECAP_EMAIL_FROM` subdomain is recommended so recap
deliverability cannot affect verification-email delivery.

## Not implemented

- **Tier gating.** The issue floats Basic/Pro gating but notes it may be
  self-defeating, since this is the feature that drives organic reach. Left
  ungated; `campaign_recap_settings` is where a gate would go.
- **Scheduled sending.** Deliberately absent — see the top of this document.
- **Per-player opt-in at join time.** Considered and rejected; unsubscribe is the
  consent control. See "Consent model" above.
