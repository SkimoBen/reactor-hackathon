# reactor-hackathon
World models hackathon!

---

# HappyOyster

A Next.js + TypeScript frontend for **HappyOyster**, a real-time interactive world model on Reactor. One button builds a preset Directing world of New York and drops you into it live; you talk, an agent watches the stream and steers the world, and a transcript panel shows both.

```
┌──────────────────────────────────────────────────────────────┐
│                                          ┌─────────────────┐ │
│                                          │ ^ Transcript  🎙 │ │
│     blurred splash  →  live world video  │ You: …          │ │
│                                          │ Director: → …   │ │
│                                          └─────────────────┘ │
│                                                              │
│                     [ Explore New York ]                     │
└──────────────────────────────────────────────────────────────┘
```

Everything model-specific runs through the typed
[`@reactor-models/happy-oyster`](https://www.npmjs.com/package/@reactor-models/happy-oyster)
package, which wraps the base
[`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk)
with a typed `connect → createWorld / attachWorld → startTravel` flow, live controls, and the `<HappyOysterVideo>` element the live world renders into.

## Quick start

> **Start a standalone project:** `npx create-reactor-app my-app --model=happy-oyster` scaffolds this example into a fresh app — no clone needed. The steps below are for running it in-place from a monorepo checkout.

```bash
cp .env.example .env.local
# add your key: REACTOR_API_KEY=rk_...   (grab one at reactor.inc/account/api-keys)

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and press **Explore New York**: the app connects a Reactor session, builds the preset world, and drops you into the live travel.

The API key never reaches the browser: the server route [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts) exchanges it for a short-lived JWT (see [docs.reactor.inc/authentication](https://docs.reactor.inc/authentication)), and the SDK re-fetches it (through the browser's HTTP cache) on every Reactor Platform call via the `getJwt` resolver.

## What you can do with it

- **One preset world.** The prompt and first frame live in [`lib/agent/config.ts`](lib/agent/config.ts) (`START_SCENE`). The transcript's gear opens a debug panel whose Settings tab can override the prompt, resolution, layout and narrative, plus the agents' models and system prompts ([`lib/agent/settings.ts`](lib/agent/settings.ts)).
- **Talk to it.** Pressing Explore turns on browser speech recognition (Chrome / Safari); each phrase goes to the Concierge agent, which can open a real shop's page or steer the scene. Browsers without it get a text field in the panel.
- **Watch the Director.** While the travel is live, the Director agent looks at a frame every few seconds and sends the world instructions; its observations and moves appear in the transcript.

## Voice notes (Gemini 3.5 Transcribe Live)

Anywhere you'd type to the model, you can talk instead:

- **Describe a world by voice.** In *Create a world*, press **Describe it by voice**, say what you want, and press **Stop & use**. The note is transcribed live by `gemini-3.5-transcribe-live` and, by default, expanded by Gemini into a paragraph-length world prompt that fits what's left of the prompt cap after the system prompt (short prompts build unstable worlds). It lands in the prompt box for editing; nothing builds until you press **Build world**. With text already in the box, a note revises it ("make it night, add fireflies").
- **Steer a Directing world by voice.** While traveling, press **Speak an instruction**; when you stop, the transcript goes straight to `instruct()` (logged for the agents like a typed one).
- **Talk to the agents.** In the Agents console, **Say it out loud** sends the transcript to the Concierge, exactly as if you'd typed it into *Say something*.

```
mic ─▶ AudioWorklet (16 kHz PCM16) ─▶ Gemini Live, ephemeral token ─▶ transcript
                                                       ├─▶ /api/world-prompt ─▶ composer ─▶ createWorld()
                                                       ├─▶ instruct()   (Directing travel)
                                                       └─▶ Concierge    (Agents console)
```

| File | What's in it |
| --- | --- |
| [`lib/transcriber.ts`](lib/transcriber.ts) | Mic capture and the Gemini Live session; `finish()` ends a note and waits for the last words. |
| [`public/pcm-recorder-worklet.js`](public/pcm-recorder-worklet.js) | AudioWorklet: native-rate mic → 16 kHz mono PCM16 in 100 ms chunks. |
| [`components/happy-oyster/VoiceNote.tsx`](components/happy-oyster/VoiceNote.tsx) | The record / stop / live-caption button all three surfaces use (light and dark looks). |
| [`app/api/gemini/token/route.ts`](app/api/gemini/token/route.ts) | Mints a single-use Gemini Live token locked to the transcription model; the key stays server-side. |
| [`app/api/world-prompt/route.ts`](app/api/world-prompt/route.ts) | Voice note → mode-aware world prompt. |

## How it works

Each experience is its own Reactor model — `happy-oyster-adventure` and `happy-oyster-director` — so the **mode is chosen before connecting** and fixed for the life of the session. This app always uses Directing; [`HappyOysterApp`](app/HappyOysterApp.tsx) mounts the provider on it.

From there the flow is the typed SDK's linear lifecycle:

1. **`connect()`** opens the Reactor session and syncs the first `world_state` snapshot.
2. **`createWorld(params)` / `attachWorld(id)`** makes a world the session's current one — create builds a fresh world (~30s), attach reopens a permanent one (instant).
3. **`startTravel()`** begins streaming the live world into `<HappyOysterVideo>` and unlocks the controls.

The model owns all world state and broadcasts one authoritative `world_state` snapshot on every change (and a `travel_state` snapshot during travel). The app mirrors those snapshots and never derives world state locally, so the UI can't drift from the model. Adventure `hold()` / `interact()` and Directing `instruct()` / `pause()` / `rewind()` steer the live world.

## The typed SDK

Everything model-specific runs through the typed **`@reactor-models/happy-oyster`** package, imported at `@reactor-models/happy-oyster` (the plain-JS client and types) and `@reactor-models/happy-oyster/react` (the provider, hooks, and `<HappyOysterVideo>`). It wraps the base `@reactor-team/js-sdk` with the `connect → createWorld / attachWorld → startTravel` flow, the live controls, and the video element — so this app never touches the base SDK directly.

## Configuration

| Env var                        | Required   | What it does                                                                                                                                                     |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REACTOR_API_KEY`              | yes (live) | Server-side key exchanged for session JWTs by `app/api/reactor/token/route.ts`.                                                                                  |
| `GEMINI_API_KEY`               | voice only | Server-side Gemini key: mints transcription tokens and expands voice notes into world prompts. |
| `NEXT_PUBLIC_REACTOR_API_URL`  | no         | Reactor API base URL. Defaults to `https://api.reactor.inc`.                                                                                                     |
| `NEXT_PUBLIC_HO_LOCAL_RUNTIME` | no         | Set to `1` to talk straight to a runtime-served model (adventure on `:8080`, directing on `:8081`), skipping the Reactor Platform: no `REACTOR_API_KEY`, no JWT. |

`REACTOR_API_KEY` is what links the app to your Reactor account. If it's missing, still the `.env.example` placeholder, or rejected by Reactor (checked once per server start in [`lib/reactor-auth.ts`](lib/reactor-auth.ts)), the app renders a setup landing that says which, instead of failing at Connect (see [`app/SetupRequired.tsx`](app/SetupRequired.tsx)).

## Code tour

| File                                                                                                                                  | What's in it                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/page.tsx`](app/page.tsx)                                                                                                        | Server Component gate: live app or the setup landing.                                                                                                                                               |
| [`app/HappyOysterApp.tsx`](app/HappyOysterApp.tsx)                                                                                    | The shell: one stage with the transcript panel in it. Owns the pending intent, starts the preset world and the mic on Explore.                                                                      |
| [`components/happy-oyster/ho-client.tsx`](components/happy-oyster/ho-client.tsx)                                                      | The `useHappyOysterClient()` surface adapting the live SDK. Start here.                                                                                                                             |
| [`components/happy-oyster/use-world-session.ts`](components/happy-oyster/use-world-session.ts)                                        | The session driver: walks a `WorldIntent` through connect → create/attach → auto-travel, phase-driven and StrictMode-safe.                                                                          |
| [`lib/view.ts`](lib/view.ts)                                                                                                          | The app's one reducer: SDK snapshot in, `AppView` out — plus the four-step loading journey the screen traces live.                                                                                  |
| [`components/happy-oyster/Stage.tsx`](components/happy-oyster/Stage.tsx)                                                              | The stage: blurred splash before the world is up, the live stream while traveling, and the bottom dock (Explore / loading / countdown + End / Explore again / Try again).                         |
| [`components/agent/AgentPanel.tsx`](components/agent/AgentPanel.tsx)                                                                  | The collapsible transcript panel: what you said (live, via [`use-speech.ts`](components/agent/use-speech.ts)) and what the agents did.                                                            |
| [`components/agent/use-agent-runtime.ts`](components/agent/use-agent-runtime.ts)                                                      | The Director loop and the Concierge call, feeding the shared event log ([`lib/agent/events.ts`](lib/agent/events.ts)).                                                                             |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts)                                                                    | Cacheable GET route that exchanges `REACTOR_API_KEY` for a short-lived JWT.                                                                                                                         |
| [`lib/worlds.ts`](lib/worlds.ts)                                                                                                      | The countdown lengths and the `WorldIntent` type.                                                                                                                                                   |
| [`skill/SKILL.md`](skill/SKILL.md)                                                                                                    | The extension guide: the client surface, the lifecycle, the input models, auth, and every gotcha.                                                                                                   |

## Going further

Read [`skill/SKILL.md`](skill/SKILL.md) before extending. Deferred features you could add: touch/pointer control pads for mobile, snap-clip recording of the live stream, a shareable `?world=` deep link, and prompt upsampling in the composer.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · [`@reactor-models/happy-oyster`](https://www.npmjs.com/package/@reactor-models/happy-oyster) (typed HappyOyster SDK) · [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) · [`@reactor-team/ui`](https://www.npmjs.com/package/@reactor-team/ui) (design tokens)
