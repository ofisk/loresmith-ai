# Generated audio

Scene ambience, campaign theme music, and creature/NPC vocalizations, generated
from campaign context, stored as campaign assets, and played at the table.

Issue: [#756](https://github.com/ofisk/loresmith-ai/issues/756).

## The platform constraint that shapes everything here

Cloudflare Workers AI ships **speech** models and no **sound** or **music**
model. That is not a temporary gap in our integration; it is what the catalog
currently contains.

| Kind | What it is | Servable on Workers AI today |
|---|---|---|
| `voice` | A line of NPC dialogue, spoken | **Yes** — Deepgram Aura |
| `creature` | A roar, a shriek, a whisper | **Approximated** — Aura is a voice model, not a sound-effect model |
| `ambience` | Rain, a crypt, a tavern | **No** — needs an external sound model |
| `music` | A campaign or villain theme | **No** — needs an external music model |

So capability, not vendor preference, is what selects a provider. This is the
one place the audio stack deliberately differs from
[the LLM provider factory](Technical/LLM-Providers): that factory routes on a
configured provider name because every LLM provider can do every LLM job. Audio
providers cannot, and a kind can legitimately have **no** provider at all.

## Architecture

```
agent tool ─┐
            ├─→ audio-generation-service ─→ audio-provider-factory ─┬─→ workers-ai-tts-provider
HTTP route ─┘         │                         (routes on kind)    └─→ gateway-audio-provider
                      │
                      ├─→ R2      (the audio blob)
                      ├─→ D1      (campaign_audio metadata)
                      └─→ NOTIFICATIONS DO (completion)
```

| File | Role |
|---|---|
| `src/services/audio/audio-provider.ts` | Provider interface, typed errors, response normalization |
| `src/services/audio/audio-provider-factory.ts` | Capability matrix; picks a provider for a kind |
| `src/services/audio/workers-ai-tts-provider.ts` | Deepgram Aura via the `AI` binding |
| `src/services/audio/gateway-audio-provider.ts` | External sound/music model via Cloudflare AI Gateway |
| `src/services/audio/audio-generation-service.ts` | Orchestration: prompt, generate, store, meter, notify |
| `src/lib/prompts/audio-prompts.ts` | Builds provider prompts from campaign context |
| `src/lib/audio/loop-player.ts` | Seamless crossfaded looping playback (Web Audio) |
| `src/dao/campaign-audio-dao.ts` | `campaign_audio` rows |
| `src/routes/campaign-audio.ts` | GM-only HTTP surface |
| `src/tools/campaign-context/audio-tools.ts` | Conversational access |

## Generation is always asynchronous

Audio models take seconds to a minute. Nothing holds an HTTP request or a chat
turn open for that.

1. `prepareAudioGeneration` writes a row in `pending` and returns it.
2. The caller hands the slow part to `ctx.waitUntil` (routes) or fires it
   detached (agent tools). `POST` answers **202**.
3. `runAudioGeneration` calls the provider, stores the blob in R2, moves the row
   to `ready`, and notifies over the `NOTIFICATIONS` Durable Object.
4. Every failure path writes `failed` with a reason and notifies. The function
   never throws — it runs detached, where a rejection would be invisible.

A failure notification carries `retryable`. A capability gap ("Cloudflare has no
music model and none is configured") is **not** retryable and must not be
offered as though a retry could help.

## Prompts are built from campaign context

This is the reason to generate audio inside LoreSmith rather than typing the
same words into a standalone audio tool. Tone comes from the campaign record,
sensory detail from the entity graph, scene beats from planning tasks.

Audio models want the opposite of what an LLM wants. Narrative prose produces
muddy output; a sound model wants a dense comma-separated list of concrete sound
sources, and a music model wants instrumentation, mood, and tempo. The builders
in `audio-prompts.ts` extract and compress rather than summarize.

Two rules are load-bearing and easy to break by "improving" the prompts later:

- **Ambience must forbid music and speech.** Sound models will happily slip a
  melodic pad or a mumbled voice into a bed meant to loop under a talking GM.
- **A `voice` prompt is the literal line, verbatim.** Text-to-speech reads aloud
  anything appended to it, so stage direction becomes dialogue. Character is
  expressed through voice selection, never through added text.

## Storage and playback

The blob lives in R2 at `campaigns/{campaignId}/audio/{audioId}.mp3`; the
metadata lives in D1, matching [the storage strategy](Technical/Storage-Strategy).

Playback is served **through the Worker**, not from a public R2 URL, so it
carries the same campaign authorization as everything else. The client fetches
bytes through the authenticated request helper rather than pointing an
`<audio src>` at the route — an `<audio>` element cannot send an `Authorization`
header.

### Looping is not `<audio loop>`

Models emit short clips (the sound-effects endpoint caps at 22 seconds) but a
scene at the table lasts ten minutes or more, so a clip has to wrap. `<audio
loop>` leaves an audible gap at the seam because the element re-buffers on wrap;
over a twenty-second bed that gap lands every twenty seconds and is the first
thing a player notices.

`LoopPlayer` therefore decodes to an `AudioBuffer` and schedules overlapping
passes on the Web Audio clock, crossfading the tail of one into the head of the
next. The crossfade curve is **equal-power** (`sin`/`cos`), not linear: for two
uncorrelated signals a linear fade dips about 3 dB at the midpoint, which is
heard as a dropout exactly at the loop point — the artifact the crossfade exists
to remove.

## Access: GM-only

Every route gates on `requireCanSeeSpoilers` or `requireCanEdit`, both of which
exclude the player roles, and audio is never reachable through the player-facing
share flow.

That is stricter than "audio is just sound" suggests, and it is deliberate: a
track's title is built from campaign entities, so a list of tracks is a list of
what is coming. "Theme: The Betrayer's Reveal" spoils a session on its own.

A player-facing at-the-table surface is follow-on work
([#743](https://github.com/ofisk/loresmith-ai/issues/743)) and needs the
licensing question below settled first.

## Cost accounting

Audio is priced **per second of output**, not per token. Folding seconds into a
token field would silently corrupt every token total that greps the log drain,
so audio emits its own event:

- Intents `audio_ambience`, `audio_music`, `audio_voice` live in the same
  `LLM_SPEND_INTENT` vocabulary, so audio appears in the per-intent cost view.
- Spend logs as `audio_seconds_spend` with `unit: "seconds"`, via
  `logVerboseAudioSpend`.
- `secondsAreEstimate` is set when the duration was derived from encoded byte
  length rather than reported by the provider, so a cost view never presents an
  estimate as a measurement. Aura reports no duration, so TTS is always an
  estimate.

Creature vocalizations bill as `audio_voice` regardless of which provider serves
them: the cost line a user cares about is "sounds coming out of a mouth", not
which model made it.

## Configuration

Voice and creature work with no configuration beyond the existing `AI` binding.

Ambience and music require an external provider through Cloudflare AI Gateway,
and are **inert until configured**. With `ELEVENLABS_API_KEY` unset, the provider
is never constructed, the factory reports those kinds unavailable, and the UI
explains why. Merging this feature commits the project to no vendor and no
spend; setting the secret is the deliberate act that turns it on.

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Vendor key. Absent → ambience and music stay unavailable. |
| `AI_GATEWAY_ACCOUNT_ID` | Cloudflare account id for the gateway path. |
| `AI_GATEWAY_ID` | AI Gateway id. |
| `AUDIO_GATEWAY_BASE_URL` | Overrides the gateway URL. For tests, or a different vendor. |

Routing through AI Gateway rather than calling the vendor directly is what makes
the dependency defensible: caching, rate limiting, logging, and cost visibility
stay on Cloudflare. That matters more for audio than for text, because one
generation costs orders of magnitude more than a completion and identical scene
prompts recur constantly across campaigns ("tavern murmur", "rain on stone").

## Open questions still outstanding

These are from #756 and are **not** resolved by the current implementation:

1. **Which external provider**, and whether adding a non-Cloudflare vendor clears
   the bar at all. The gateway provider defaults to ElevenLabs but is a thin
   HTTP adapter; swapping vendors is one class.
2. **Licensing.** Generated audio played at a table is fine. Generated audio
   embedded in a public campaign page
   ([#747](https://github.com/ofisk/loresmith-ai/issues/747)) or a recap email
   ([#752](https://github.com/ofisk/loresmith-ai/issues/752)) raises
   redistribution questions that differ per provider's terms. Audio is GM-only
   today partly for this reason.
3. **Generated versus curated.** A licensed loop library tagged by scene type may
   beat generation on quality per dollar for ambience specifically. Generation
   clearly wins for campaign-specific themes and named-monster sounds.
4. **Free-tier metering.** Audio seconds are logged but are not yet wired into
   the free-tier trial limits in
   [#746](https://github.com/ofisk/loresmith-ai/issues/746), which counts tokens.

## Related

- [Session runsheet](Technical/Session-Runsheet) — where audio is surfaced at the table
- [Storage strategy](Technical/Storage-Strategy) — R2 for blobs, D1 for metadata
- [LLM providers](Technical/LLM-Providers) — the pattern this deliberately inverts
