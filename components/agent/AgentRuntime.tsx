"use client";

// The client half of the agents, mounted once inside the live provider.
//
//   Director  — on a timer while a Directing travel is live: grab a frame,
//               ask /api/agent/director, send any instruction it returns
//               through the client (logged with source "director").
//   Concierge — on demand, when the user says something: grab a frame, ask
//               /api/agent/concierge, open the overlay it points at and send
//               its optional scene instruction (source "concierge").
//
// Both read the same event log (lib/agent/events.ts), which ho-client.tsx
// feeds with every instruction and transport call, so each agent sees what
// the user and the other agent did.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DIRECTOR_INTERVAL_MS,
  EVENT_WINDOW,
  START_SCENE,
} from "@/lib/agent/config";
import {
  describeEvent,
  logEvent,
  recentEvents,
  useAgentEvents,
} from "@/lib/agent/events";
import { captureFrame } from "@/lib/agent/screenshot";
import type { DirectorOutput } from "@/lib/agent/director";
import type { ConciergeOutput } from "@/lib/agent/concierge";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import { AgentConsole } from "./AgentConsole";
import { AgentOverlay, type OverlayTarget } from "./AgentOverlay";

export function AgentRuntime({ session }: { session: WorldSession }) {
  const { client } = session;
  const events = useAgentEvents();
  const [directorEnabled, setDirectorEnabled] = useState(true);
  const [conciergeBusy, setConciergeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayTarget | null>(null);

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
      events: recentEvents(EVENT_WINDOW).map(describeEvent),
    };
  }, []);

  // ── Director loop ──────────────────────────────────────────────────────────
  const directorBusy = useRef(false);
  const lastInstruction = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !directing || !directorEnabled) return;
    const tick = async () => {
      if (directorBusy.current) return;
      const screenshot = captureFrame();
      if (!screenshot) return;
      directorBusy.current = true;
      try {
        const result = await post<DirectorOutput>("/api/agent/director", {
          screenshot,
          ...context(),
        });
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
    const id = setInterval(() => void tick(), DIRECTOR_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live, directing, directorEnabled, context]);

  // ── Concierge ──────────────────────────────────────────────────────────────
  const say = useCallback(
    async (text: string) => {
      setError(null);
      setConciergeBusy(true);
      logEvent({ kind: "user_say", text });
      try {
        const result = await post<ConciergeOutput>("/api/agent/concierge", {
          utterance: text,
          screenshot: captureFrame(),
          ...context(),
        });
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

  const closeOverlay = useCallback(() => setOverlay(null), []);

  return (
    <>
      <AgentConsole
        events={events}
        busy={conciergeBusy}
        error={error}
        streaming={live && directing}
        directorEnabled={directorEnabled}
        onToggleDirector={() => setDirectorEnabled((value) => !value)}
        onSay={(text) => void say(text)}
      />
      {overlay && <AgentOverlay target={overlay} onClose={closeOverlay} />}
    </>
  );
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
