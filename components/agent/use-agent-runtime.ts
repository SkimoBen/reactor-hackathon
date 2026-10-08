"use client";

// The client half of the agents, run once inside the live provider. A hook
// rather than a component so the shell decides where its pieces render: the
// transcript panel sits inside the stage, the overlay above everything.
//
//   Director  — on a timer while a Directing travel is live: grab a frame,
//               ask /api/agent/director, send any instruction it returns
//               through the client (logged with source "director").
//   Concierge — on demand, when the user says something: grab a frame, ask
//               /api/agent/concierge, open the overlay it points at and send
//               its optional scene instruction (source "concierge").
//
// The Director is on unless the debug panel's Settings tab turns it off;
// both agents read their model, prompt and other knobs from lib/agent/
// settings.ts at call time, and every call lands in lib/agent/debug.ts.
//
// Both read the same event log (lib/agent/events.ts), which ho-client.tsx
// feeds with every instruction and transport call, so each agent sees what
// the user and the other agent did.

import { useCallback, useEffect, useRef, useState } from "react";
import { START_SCENE } from "@/lib/agent/config";
import {
  describeEvent,
  logEvent,
  recentEvents,
  useAgentEvents,
  type AgentEvent,
} from "@/lib/agent/events";
import { captureFrame } from "@/lib/agent/screenshot";
import { logCall } from "@/lib/agent/debug";
import {
  conciergeOverrides,
  directorOverrides,
  getSettings,
  useAgentSettings,
} from "@/lib/agent/settings";
import type { AgentTrace, LastOverlay } from "@/lib/agent/protocol";
import type { DirectorOutput } from "@/lib/agent/director";
import type { ConciergeOutput } from "@/lib/agent/concierge";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import type { OverlayTarget } from "./AgentOverlay";

export interface AgentRuntime {
  events: AgentEvent[];
  /** The Concierge is working on something the user said. */
  busy: boolean;
  error: string | null;
  overlay: OverlayTarget | null;
  closeOverlay: () => void;
  /** Hand the Concierge something the user said. */
  say: (text: string) => void;
}

export function useAgentRuntime(session: WorldSession): AgentRuntime {
  const { client } = session;
  const events = useAgentEvents();
  const [conciergeBusy, setConciergeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayTarget | null>(null);
  const { enabled: directorEnabled, intervalMs: directorIntervalMs } =
    useAgentSettings().director;

  const directing = client.worldState?.mode === 2;
  const live = client.streaming && client.travelStatus !== "paused";

  // The timer reads the latest client through a ref so it isn't torn down
  // and rebuilt on every snapshot.
  const latest = useRef({ client });
  latest.current = { client };

  const context = useCallback(() => {
    const { client } = latest.current;
    return {
      place: START_SCENE.place,
      worldPrompt: client.worldState?.prompt ?? null,
      chapters: (client.travelState?.chapters ?? [])
        .map((chapter) => chapter.brief ?? chapter.title ?? null)
        .filter((brief): brief is string => !!brief),
      events: recentEvents(getSettings().eventWindow).map(describeEvent),
    };
  }, []);

  // ── Director loop ──────────────────────────────────────────────────────────
  const directorBusy = useRef(false);
  const lastInstruction = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !directing || !directorEnabled) return;
    const tick = async () => {
      if (directorBusy.current) return;
      // Let the last instruction land before judging the scene again.
      const recent = recentInstruction();
      if (recent && recent.secondsAgo * 1000 < getSettings().director.cooldownMs)
        return;
      const screenshot = captureFrame(getSettings().screenshotWidth);
      if (!screenshot) return;
      directorBusy.current = true;
      try {
        const result = await traced<DirectorOutput>(
          "director",
          "/api/agent/director",
          {
            screenshot,
            ...context(),
            lastInstruction: recent,
            settings: directorOverrides(),
          },
        );
        logEvent({
          kind: "director",
          observation: result.observation,
          instruction: result.instruction,
        });
        const { client } = latest.current;
        if (
          result.instruction &&
          result.instruction !== lastInstruction.current &&
          client.streaming
        ) {
          lastInstruction.current = result.instruction;
          await client.instruct(result.instruction, { source: "director" });
        }
      } catch (cause) {
        logEvent({ kind: "error", source: "director", text: message(cause) });
      } finally {
        directorBusy.current = false;
      }
    };
    const id = setInterval(() => void tick(), directorIntervalMs);
    return () => clearInterval(id);
  }, [live, directing, directorEnabled, directorIntervalMs, context]);

  // ── Concierge ──────────────────────────────────────────────────────────────
  // The last overlay it opened and when the user closed it, so a later
  // utterance at the same counter doesn't pop the shop the user just dismissed.
  const lastOverlay = useRef<OverlayRecord | null>(null);

  const say = useCallback(
    async (text: string) => {
      setError(null);
      setConciergeBusy(true);
      logEvent({ kind: "user_say", text });
      try {
        const result = await traced<ConciergeOutput>(
          "concierge",
          "/api/agent/concierge",
          {
            utterance: text,
            screenshot: captureFrame(getSettings().screenshotWidth),
            ...context(),
            lastOverlay: overlayAges(lastOverlay.current),
            settings: conciergeOverrides(),
          },
        );
        logEvent({ kind: "concierge", summary: result.reasoning });
        const { client } = latest.current;
        if (
          result.world_instruction &&
          client.worldState?.mode === 2 &&
          client.streaming
        ) {
          void client
            .instruct(result.world_instruction, { source: "concierge" })
            .catch((cause) =>
              logEvent({
                kind: "error",
                source: "concierge",
                text: message(cause),
              }),
            );
        }
        if (result.action === "open_overlay" && result.overlay_url) {
          const title = result.shop?.name ?? hostOf(result.overlay_url);
          setOverlay({
            title,
            address: result.shop?.address ?? null,
            url: result.overlay_url,
            embeddable: result.embeddable,
            note: plainText(result.reasoning),
          });
          lastOverlay.current = {
            title,
            url: result.overlay_url,
            openedAt: Date.now(),
            closedAt: null,
          };
          logEvent({ kind: "overlay", title, url: result.overlay_url });
        }
      } catch (cause) {
        const text = message(cause);
        setError(text);
        logEvent({ kind: "error", source: "concierge", text });
      } finally {
        setConciergeBusy(false);
      }
    },
    [context],
  );

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    const last = lastOverlay.current;
    if (!last || last.closedAt !== null) return;
    last.closedAt = Date.now();
    logEvent({
      kind: "overlay_closed",
      title: last.title,
      openSeconds: Math.round((last.closedAt - last.openedAt) / 1000),
    });
  }, []);

  return {
    events,
    busy: conciergeBusy,
    error,
    overlay,
    closeOverlay,
    say: useCallback((text: string) => void say(text), [say]),
  };
}

// POST to an agent route and record the call for the debug panel, whether it
// succeeds or not. The overrides are left out of the record: the trace shows
// what the server actually used.
async function traced<T extends { trace: AgentTrace }>(
  agent: "director" | "concierge",
  url: string,
  body: { screenshot: string | null; settings: unknown } & Record<string, unknown>,
): Promise<T> {
  const at = Date.now();
  const started = performance.now();
  const { screenshot, settings: _settings, ...request } = body;
  const record = { agent, at, screenshot, request };
  try {
    const data = await post<T>(url, body);
    const { trace, ...result } = data;
    logCall({
      ...record,
      durationMs: performance.now() - started,
      trace,
      result,
      error: null,
    });
    return data;
  } catch (cause) {
    logCall({
      ...record,
      durationMs: performance.now() - started,
      trace: null,
      result: null,
      error: message(cause),
    });
    throw cause;
  }
}

/** The newest instruction sent to the world, from any source, with its age. */
function recentInstruction() {
  const event = recentEvents(Infinity).findLast(
    (event) => event.kind === "instruction",
  );
  if (event?.kind !== "instruction") return null;
  return {
    source: event.source,
    text: event.text,
    secondsAgo: Math.round((Date.now() - event.at) / 1000),
  };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${url} returned ${res.status}`);
  return data;
}

interface OverlayRecord {
  title: string;
  url: string;
  openedAt: number;
  closedAt: number | null;
}

function overlayAges(last: OverlayRecord | null): LastOverlay | null {
  if (!last) return null;
  const now = Date.now();
  return {
    title: last.title,
    url: last.url,
    openedSecondsAgo: Math.round((now - last.openedAt) / 1000),
    closedSecondsAgo:
      last.closedAt === null ? null : Math.round((now - last.closedAt) / 1000),
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// The model sometimes writes markdown links into its reasoning; the note is
// rendered as text, so keep the label and drop the link syntax.
function plainText(text: string): string {
  return text.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
