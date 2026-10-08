"use client";

// "Explore <somewhere>": go into a real store or restaurant, and open its
// website the moment the character turns in.
//
//   1. The utterance (spoken or typed) is caught before the Concierge sees it.
//   2. The world is told to walk to the place and turn into its entrance.
//   3. /api/walk/explore finds the real business — a storefront on this block
//      when one fits — and its website.
//   4. The site is held in the agents' overlay (the transcript panel shows it
//      waiting) until the walk sees the character turn into a storefront
//      (lib/walk/tracker.ts "facing"); the agents' Watcher also looks for the
//      moment on screen, as a backstop.
// A turn-in that happens while the site is still being found counts for a
// while, so a quick turn isn't missed. Only while a Directing world streams;
// otherwise the utterance goes to the Concierge as usual.

import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent } from "@/lib/agent/events";
import { parseExplore, type ExploreContext, type ExplorePlace } from "@/lib/walk/explore";
import { crossStreet } from "@/lib/walk/streets";
import type { Store } from "@/lib/walk/types";
import type { OverlayTarget } from "@/components/agent/AgentOverlay";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import type { Walk } from "./use-walk";

const TURNED_IN_GRACE_MS = 45_000;
const HOLD_MS = 150_000;

/** The agents' overlay, as the walk's explore and exit commands drive it. */
export interface OverlayControls {
  openOverlay: (target: OverlayTarget) => void;
  closeOverlay: () => void;
  /** Title of the overlay showing, if any. */
  overlayTitle: string | null;
  holdOverlay: (
    target: OverlayTarget,
    condition: string,
    utterance: string,
    timeoutMs?: number,
  ) => void;
  /** Title of the overlay being held, if any. */
  pendingTitle: string | null;
}

export interface Exploring {
  query: string;
  status: "finding" | "held";
  place: ExplorePlace | null;
}

export function useExplore(
  session: WorldSession,
  walk: Walk,
  nearby: { left: Store[]; right: Store[] },
  overlay: OverlayControls,
): {
  handle: (utterance: string) => boolean;
  exploring: Exploring | null;
  /** The place whose site explore last opened, for "get back out". */
  opened: { current: string | null };
} {
  const [exploring, setExploring] = useState<Exploring | null>(null);
  const latest = useRef({ session, walk, nearby, overlay });
  latest.current = { session, walk, nearby, overlay };
  // The request in flight; a newer "explore" replaces it.
  const request = useRef<{ id: number; turnedInAt: number | null } | null>(null);
  const held = useRef<OverlayTarget | null>(null);
  const opened = useRef<string | null>(null);

  const handle = useCallback((utterance: string) => {
    const query = parseExplore(utterance);
    const { session, walk, nearby, overlay } = latest.current;
    const client = session.client;
    if (!query || !client.streaming || client.worldState?.mode !== 2) return false;

    const id = Date.now();
    request.current = { id, turnedInAt: null };
    held.current = null;
    setExploring({ query, status: "finding", place: null });
    logEvent({ kind: "user_say", text: utterance });
    logEvent({
      kind: "concierge",
      summary: `Heading into ${query}. Its website opens when you turn in.`,
    });
    void client
      .instruct(`You walk up to ${query} and turn into its entrance.`, { source: "user" })
      .catch((cause) => logEvent({ kind: "error", source: "user", text: message(cause) }));

    const { link, position } = walk;
    const context: ExploreContext = {
      query,
      street: link.street,
      between: [crossStreet(link.from, link.street), crossStreet(link.to, link.street)],
      lat: position.lat,
      lng: position.lng,
      left: nearby.left,
      right: nearby.right,
    };
    void fetch("/api/walk/explore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    })
      .then(async (res) => {
        const body = (await res.json()) as ExplorePlace & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body;
      })
      .then((place) => {
        const current = request.current;
        if (current?.id !== id) return; // superseded
        const target = overlayTarget(place);
        logEvent({
          kind: "concierge",
          summary: `Found ${target.title}${place.side ? ` on your ${place.side}` : ""}.`,
        });
        const { overlay } = latest.current;
        if (current.turnedInAt && Date.now() - current.turnedInAt < TURNED_IN_GRACE_MS) {
          finish();
          opened.current = target.title;
          overlay.openOverlay(target);
          return;
        }
        held.current = target;
        setExploring({ query, status: "held", place });
        overlay.holdOverlay(
          target,
          `the character turns into ${target.title} and steps inside`,
          utterance,
          HOLD_MS,
        );
      })
      .catch((cause) => {
        if (request.current?.id !== id) return;
        finish();
        logEvent({ kind: "error", source: "concierge", text: message(cause) });
      });
    return true;
  }, []);

  const finish = () => {
    request.current = null;
    held.current = null;
    setExploring(null);
  };

  // The character turned toward a storefront: that's the turn-in.
  const activity = walk.activity;
  const previous = useRef(activity);
  useEffect(() => {
    const was = previous.current;
    previous.current = activity;
    if (activity !== "facing" || was === "facing" || !request.current) return;
    const target = held.current;
    if (!target) {
      request.current.turnedInAt = Date.now(); // still finding: open on arrival
      return;
    }
    if (latest.current.overlay.pendingTitle === target.title) {
      finish();
      opened.current = target.title;
      latest.current.overlay.openOverlay(target);
    }
  }, [activity]);

  // The hold ended some other way — cancelled, or the Watcher opened it.
  const pendingTitle = overlay.pendingTitle;
  useEffect(() => {
    if (held.current && pendingTitle !== held.current.title) finish();
  }, [pendingTitle]);

  return { handle, exploring, opened };
}

function overlayTarget(place: ExplorePlace): OverlayTarget {
  const title = place.name.split(/\s[-–|]\s/)[0].trim();
  return {
    title,
    address: place.address,
    url: place.url,
    embeddable: place.embeddable,
    note: place.side ? `On your ${place.side} as you walk.` : null,
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
