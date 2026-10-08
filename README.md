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
- **Talk to it.** Hold space (or the panel's mic button) and speak; Gemini 3.5 Transcribe Live transcribes it as you talk, and each phrase goes to the Concierge agent, which can open a real shop's page or steer the scene. Browsers without a microphone API get a text field in the panel.
- **Watch the Director.** While the travel is live, the Director agent looks at a frame every few seconds and sends the world instructions; its observations and moves appear in the transcript.

## Voice (Gemini 3.5 Transcribe Live)

Push-to-talk runs on `gemini-3.5-transcribe-live` in SMART mode, which drops filler words and false starts. Each press opens a transcription session over a single-use ephemeral token, so `GEMINI_API_KEY` never reaches the browser; audio captured while it connects is held, so the first words aren't lost. The phrase being spoken shows in grey in the transcript; each finished phrase goes to the Concierge. On release, Gemini gets the end of the audio and a moment to commit the last words, and a phrase it never commits is sent as-is.

```
hold space ─▶ AudioWorklet (16 kHz PCM16) ─▶ Gemini Live ─▶ interim ─▶ transcript panel
                                                         └▶ final   ─▶ Concierge
```

| File | What's in it |
| --- | --- |
| [`components/agent/use-speech.ts`](components/agent/use-speech.ts) | Push-to-talk: space / mic button → one transcription session per press. |
| [`lib/transcriber.ts`](lib/transcriber.ts) | Mic capture and the Gemini Live session; `finish()` ends a press and waits for the last words. |
| [`public/pcm-recorder-worklet.js`](public/pcm-recorder-worklet.js) | AudioWorklet: native-rate mic → 16 kHz mono PCM16 in 100 ms chunks. |
| [`app/api/gemini/token/route.ts`](app/api/gemini/token/route.ts) | Mints a single-use Gemini Live token locked to the transcription model. |

## Where you are, and what's around you

While you explore, real store names float over the storefronts and a mini-map in the bottom-right corner follows the character around real Manhattan streets.

- **Position, from the video itself.** HappyOyster reports no position, so ~10 times a second the app reads the camera's motion off the live video with a coarse optical flow ([`lib/walk/flow.ts`](lib/walk/flow.ts)): the scene expanding means walking, sliding sideways means turning, neither means standing still. A tracker ([`lib/walk/tracker.ts`](lib/walk/tracker.ts)) snaps that onto the real street grid around Broadway ([`lib/walk/streets.ts`](lib/walk/streets.ts), from OpenStreetMap), like a car's navigation does:
  - stop, and the cursor stops; walk, and it moves along the block at your pace (default **16 min/mile**, changeable in the mini-map);
  - turn at a corner, and it takes the cross street on that side; turn around, and it walks back;
  - turn mid-block, and it stays put "at a storefront" until you turn back (keep walking that way and it takes the nearest corner, since the generated world's corners won't line up exactly with the map's).

  The arrow shows where the character faces and the blue line where they've been. Every travel starts at Broadway & W 26th St, the start frame's corner.
- **Store names.** For each block you're on (and the one ahead, plus the cross streets as you near a corner), [`/api/walk/stores`](app/api/walk/stores/route.ts) asks Gemini with **Grounding with Google Maps** for the businesses on each side of the street, keeping only names backed by a Google Maps place (with its Maps link). A lookup takes ~30 s, so blocks are fetched ahead of you and kept for 30 minutes.
- **Placing them.** While the world streams, [`/api/walk/label`](app/api/walk/label/route.ts) sends the current frame to Gemini vision with this block's stores, split into your left and right for the way you're walking, and gets back boxes for the storefronts it can label. Tags pin to the top of each box, link to Google Maps, and fade when they go stale.

Tuning: the motion reader assumes a ~70° horizontal field of view and treats a scene expanding faster than 6%/s as walking ([`components/walk/use-walk.ts`](components/walk/use-walk.ts)). Open the app with `?walkdebug` to see the live readings on the mini-map while you adjust them.

Limits worth knowing: positions are estimated from camera motion, so cinematic camera moves can read as steps or turns, and distances are only as right as the pace. The world is generated, so after the opening photo a tag is the most plausible real store for that storefront, not recognition. A labelling call takes ~5 s, so tags trail the moving camera a little. Each walk costs a few Google Maps grounding queries plus a vision call every few seconds on your Gemini key. Google requires Maps-sourced names to be attributed (the "Store names: Google Maps" chip and the tags' Maps links do that), and OpenStreetMap's tile policy asks for light use with attribution.

| File | What's in it |
| --- | --- |
| [`components/walk/WalkLayer.tsx`](components/walk/WalkLayer.tsx) | Mounts the overlay and mini-map on the stage. |
| [`components/walk/use-walk.ts`](components/walk/use-walk.ts) | Samples the video, reads its motion, and runs the tracker. |
| [`components/walk/use-store-labels.ts`](components/walk/use-store-labels.ts) | Block prefetching and the frame-labelling loop. |
| [`components/walk/StoreLabelOverlay.tsx`](components/walk/StoreLabelOverlay.tsx) | The tags, mapped through the video's object-cover crop and decluttered. |
| [`components/walk/MiniMap.tsx`](components/walk/MiniMap.tsx) | The corner map: arrow, trail, street, and what the character is doing. |

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
| `GEMINI_API_KEY`               | voice only | Server-side Gemini key that mints the push-to-talk transcription tokens (`gemini-3.5-transcribe-live`). |
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
