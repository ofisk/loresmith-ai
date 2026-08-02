# Generated audio

Scene ambience, one-shot sound effects, campaign theme music, and creature/NPC
vocalizations, generated from campaign context, stored as campaign assets, and
played at the table.

Issue: [#756](https://github.com/ofisk/loresmith-ai/issues/756).

## The platform constraint that shapes everything here

Cloudflare Workers AI ships **speech** models and no **sound** or **music**
model. That is not a temporary gap in our integration; it is what the catalog
currently contains.

| Kind | What it is | Servable on Workers AI today |
|---|---|---|
| `voice` | A line of NPC dialogue, spoken | **Yes** — Deepgram Aura |
| `creature` | A roar, a shriek, a whisper | **Approximated** — Aura is a voice model, not a sound-effect model |
| `ambience` | Rain, a crypt, a tavern — a bed that loops under a scene | **No** — needs an external sound model |
| `sfx` | A door slam, a spell discharge — one shot, fired on a beat | **No** — needs an external sound model |
| `music` | A campaign or villain theme | **No** — needs an external music model |

`ambience` and `sfx` reach the same vendor endpoint but stay separate kinds
because everything around them differs: an ambience bed is long, loops, and must
survive a GM talking over it; an effect is short, transient, and fires once. They
get different default durations, different loop defaults, and deliberately
opposite prompts — one asks for "steady, no transitions", the other for "sharp
transient, silence before and after". Collapsing them into one kind with a flag
would make every one of those a caller's problem.

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
| `src/agents/audio-agent.ts` | The agent that owns those tools in chat |

## Reaching it from chat

Audio is its own agent, not a set of extra responsibilities on the campaign
context agent. That split is the fix for
[#788](https://github.com/ofisk/loresmith-ai/issues/788), where the entire
feature shipped working and unreachable: the tools were registered inside
`campaignContextToolsBundle`, whose routing description mentions entities,
search, and world state and says nothing about sound. `AgentRouter` builds its
classifier prompt from exactly those descriptions, so "generate music" had no
signal pointing anywhere useful and landed on an agent that truthfully answered
that it could not produce audio.

The lesson generalizes past audio: **a tool is only reachable if some agent's
routing description describes it.** Registering a tool in a bundle is not
enough, and the failure is silent — it looks like a hallucinated capability
denial rather than a configuration problem.

Routing to `audio` happens on two layers:

- **Deterministic** (`agent-routing-fast-path.ts`) — anchored patterns match
  requests whose audio noun is the direct object of a generation verb
  ("generate music", "make ambience for the crypt scene"). These skip the
  classifier entirely. The anchoring is what keeps them safe: "generate a
  summary of the music the bards play" is a campaign question and does not
  match.
- **Classifier** — everything looser, steered by the agent description and the
  routing rule in `agent-routing-prompts.ts`.

The agent is GM-only with **no** player subset. `buildAudioTitle` names tracks
after campaign entities, so "Theme: The Betrayer's Reveal" spoils a session
merely by appearing in a list. `getToolsForRole` returns an empty bundle for
player roles, matching the route-level gate in `src/routes/campaign-audio.ts`.

Two prompt rules exist to prevent specific regressions:

- A capability gap is stated once and never retried. The agent may not offer a
  retry, suggest trying later, or speculate that the capability might arrive.
- The agent must never fall back to writing a prompt for an external music,
  sound, or voice service. Handing the GM text to paste into another product is
  the exact behavior this feature was built to replace, and it is what #788
  observed in production.

### The gap is stated, not explained

`UNAVAILABLE_REASON` in the provider factory is written for developers, and it
names the platform and the missing vendor. The GM never reads it.
`sanitizeUserFacingText` (added in
[#787](https://github.com/ofisk/loresmith-ai/issues/787)) redacts any tool error
containing that vocabulary — "Cloudflare", "Workers AI", "audio provider", "not
configured" all match — and replaces the whole message with "That's not
something I can do right now." The raw text is logged instead.

So when you are debugging an unavailable kind, read the logs; the chat
transcript will only ever show the plain-language stand-in. This is deliberate:
#788 originally asked for the gap to be explained to the GM as "music requires
an external provider that is not configured", and #787 superseded that. The
substance survives — no retry, no rival-service prompt, a clear statement that
it cannot be done — and only the reason is withheld.

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

Models emit short clips (the sound-effects endpoint caps at 30 seconds) but a
scene at the table lasts ten minutes or more, so a clip has to wrap. `<audio
loop>` leaves an audible gap at the seam because the element re-buffers on wrap;
over a twenty-second bed that gap lands every twenty seconds and is the first
thing a player notices.

Looping is therefore solved in two places, and the order matters:

1. **Ask the model first.** The ElevenLabs v2 sound model accepts `loop: true`
   and renders a clip whose end already matches its start. Any track stored as
   `loopable` requests it. This is strictly better than fixing the seam at
   playback, because no amount of fading reconciles a bed whose start and end
   disagree.
2. **Crossfade what comes back anyway.** `LoopPlayer` decodes to an
   `AudioBuffer` and schedules overlapping passes on the Web Audio clock,
   crossfading the tail of one pass into the head of the next. It still earns
   its place: the Workers AI path has no loop flag, and a model asked for a
   seamless wrap does not always deliver one.

The crossfade curve is **equal-power** (`sin`/`cos`), not linear: for two
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

Ambience, effects, and music require an external provider through Cloudflare AI
Gateway, and are **inert until configured**. With `ELEVENLABS_API_KEY` unset, the
provider is never constructed, the factory reports those kinds unavailable, and
the UI explains why. Merging this feature commits the project to no vendor and no
spend; setting the secret is the deliberate act that turns it on.

| Variable | Required | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | Yes | Vendor key. Absent → ambience, sfx, and music stay unavailable. |
| `AI_GATEWAY_ACCOUNT_ID` | Yes | Cloudflare account id for the gateway path. |
| `AI_GATEWAY_ID` | Yes | AI Gateway id. |
| `ELEVENLABS_VOICE_ID` | No | Voice used for NPC dialogue. Defaults to a premade voice. |
| `AUDIO_VOICE_PROVIDER` | No | Set to `workers-ai` to keep NPC voice on the free model. |
| `AUDIO_GATEWAY_BASE_URL` | No | Overrides the gateway URL. For tests, or a different vendor. |

**An API key on its own does nothing.** All three required variables must be set
together: without a gateway to route through, `createGatewayAudioProvider`
returns `null` rather than falling back to calling the vendor directly. That is
deliberate — the gateway is the whole reason the dependency is defensible, so
there is no configuration in which a request silently bypasses it. Create one at
**Cloudflare dashboard → AI → AI Gateway**; the account id and gateway id are
both visible in that gateway's API endpoint URL.

### Which endpoint each kind uses

The vendor's contract is pinned by tests in `tests/services/audio-providers.test.ts`,
because a wrong `model_id` is a 422 from the live service and a perfectly green
local suite.

| Kind | Endpoint | Model |
|---|---|---|
| `ambience`, `sfx`, `creature` | `/v1/sound-generation` | `eleven_text_to_sound_v2` |
| `music` | `/v1/music` | `music_v1` |
| `voice` | `/v1/text-to-speech/{voice_id}` | `eleven_multilingual_v2` |

Two vendor behaviours are overridden on every request. Music is generated with
`force_instrumental` on, because Eleven Music sings by default and a track with
an AI vocalist is unusable under a GM who is themselves talking. Output format is
requested explicitly as `mp3_44100_128` rather than left to the vendor default,
because the reported track duration is derived by dividing byte length by that
exact bitrate — a silent default change would silently corrupt every duration and
every second of metered spend.

### What configuring a vendor changes about voice

Setting the key does not only enable the three unavailable kinds; it also moves
`voice` and `creature` off Workers AI, because a dedicated speech model is
audibly better than steering a generic TTS voice.

That is worth a deliberate decision rather than a silent upgrade. Voice is the
one kind whose volume is unbounded — ambience and music are generated a handful
of times per campaign, but NPC dialogue is per line, and ElevenLabs bills per
character. `AUDIO_VOICE_PROVIDER=workers-ai` pins voice back to the free
first-party model while leaving ambience, effects, and music on the vendor.

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
