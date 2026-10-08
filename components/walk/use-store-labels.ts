"use client";

// Real store names for the storefronts in the live world.
//
// Two loops:
//   Directory — each street block's storefront businesses from Google Maps
//               (/api/walk/stores). A lookup takes ~30 s, so blocks are
//               fetched ahead of you: the one you're on and the one straight
//               ahead from the moment the world starts building, and the cross
//               streets as you near a corner, in case you turn.
//   Labels    — while the world streams, grab a frame and have Gemini vision
//               place this block's (and the next block's) stores on the
//               storefronts it sees (/api/walk/label), one call after another.
//               Which side of the street is your left depends on the way
//               you're walking it. A call takes ~5 s, so labels trail the
//               camera a little; the overlay fades them as they age.

import { useCallback, useEffect, useRef, useState } from "react";
import { captureFrame } from "@/lib/agent/screenshot";
import { leftRight, linksAt, type Link } from "@/lib/walk/streets";
import { straightOn } from "@/lib/walk/tracker";
import type { Directory, Store, StorefrontLabel } from "@/lib/walk/types";
import type { Walk } from "./use-walk";

const RETRY_AFTER_MS = 20_000;
const LABEL_GAP_MS = 1_500;
const CORNER_PREFETCH_M = 40;
const MAX_PER_SIDE = 10;
const SIDES = ["north", "south", "east", "west"] as const;

export type BlockLookup =
  | { status: "loading" }
  | { status: "ready"; directory: Directory }
  | { status: "error"; at: number; message: string };

export interface PlacedLabel extends StorefrontLabel {
  /** Google Maps link for the store. */
  uri: string | null;
}

export interface StoreLabels {
  labels: PlacedLabel[];
  /** When the labelled frame was captured (ms epoch). */
  capturedAt: number;
  /** The lookup for the block you're on. */
  current: BlockLookup | undefined;
  /** Storefronts on this block and the next, by your left and right. */
  nearby: { left: Store[]; right: Store[] };
  /** Start looking up a block you're about to walk. */
  prefetch: (edge: number) => void;
  /** A block's storefronts by your left and right walking it this way, once known. */
  storesOn: (on: Link) => { left: Store[]; right: Store[] } | null;
}

export function useStoreLabels(active: boolean, walk: Walk): StoreLabels {
  const [lookups, setLookups] = useState<Record<number, BlockLookup>>({});
  const lookupsRef = useRef(lookups);
  lookupsRef.current = lookups;
  const linkRef = useRef(walk.link);
  linkRef.current = walk.link;
  const [labels, setLabels] = useState<{ labels: PlacedLabel[]; capturedAt: number }>(
    { labels: [], capturedAt: 0 },
  );

  const ensure = useCallback((edge: number) => {
    const lookup = lookupsRef.current[edge];
    if (lookup?.status === "loading" || lookup?.status === "ready") return;
    if (lookup?.status === "error" && Date.now() - lookup.at < RETRY_AFTER_MS) return;
    const set = (next: BlockLookup) => {
      lookupsRef.current = { ...lookupsRef.current, [edge]: next };
      setLookups(lookupsRef.current);
    };
    set({ status: "loading" });
    void fetch("/api/walk/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edge }),
    })
      .then(async (res) => {
        const body = (await res.json()) as Directory & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        const directory: Directory = {};
        for (const side of SIDES) if (body[side]) directory[side] = body[side];
        // Nothing found is usually a flaky lookup: try the block again later.
        if (!Object.values(directory).some((stores) => stores && stores.length > 0)) {
          throw new Error("no stores found");
        }
        set({ status: "ready", directory });
      })
      .catch((cause) =>
        set({
          status: "error",
          at: Date.now(),
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      );
  }, []);

  const { edge, to } = walk.link;
  const nearCorner = walk.link.length - walk.along < CORNER_PREFETCH_M;
  useEffect(() => {
    if (!active) return;
    ensure(edge);
    const ahead = straightOn(linkRef.current);
    if (ahead) ensure(ahead.edge);
    if (nearCorner) for (const l of linksAt(to)) if (l.edge !== edge) ensure(l.edge);
    const retry = setInterval(() => ensure(edge), RETRY_AFTER_MS);
    return () => clearInterval(retry);
  }, [active, edge, to, nearCorner, ensure]);

  useEffect(() => {
    if (!walk.live) {
      setLabels({ labels: [], capturedAt: 0 });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const { left, right } = candidates(lookupsRef.current, linkRef.current);
      const screenshot = left.length + right.length > 0 ? captureFrame() : null;
      if (screenshot) {
        const capturedAt = Date.now();
        try {
          const res = await fetch("/api/walk/label", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              screenshot,
              left: left.map((store) => store.name),
              right: right.map((store) => store.name),
            }),
          });
          const body = (await res.json()) as { storefronts?: StorefrontLabel[] };
          if (res.ok && !cancelled) {
            const uris = new Map([...left, ...right].map((s) => [s.name, s.uri]));
            setLabels({
              labels: (body.storefronts ?? []).map((label) => ({
                ...label,
                uri: uris.get(label.name) ?? null,
              })),
              capturedAt,
            });
          }
        } catch {
          // A missed frame just leaves the last labels to fade.
        }
      }
      if (!cancelled) timer = setTimeout(() => void run(), LABEL_GAP_MS);
    };
    timer = setTimeout(() => void run(), LABEL_GAP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [walk.live]);

  const storesOn = useCallback((on: Link) => {
    const lookup = lookupsRef.current[on.edge];
    if (lookup?.status !== "ready") return null;
    const sides = leftRight(on);
    return {
      left: lookup.directory[sides.left] ?? [],
      right: lookup.directory[sides.right] ?? [],
    };
  }, []);

  return {
    ...labels,
    current: lookups[walk.link.edge],
    nearby: candidates(lookups, walk.link),
    prefetch: ensure,
    storesOn,
  };
}

// This block's stores first, then the next block's (visible further along),
// each side mapped to your left or right for the way you're walking.
function candidates(
  lookups: Record<number, BlockLookup>,
  on: Link,
): { left: Store[]; right: Store[] } {
  const left: Store[] = [];
  const right: Store[] = [];
  const ahead = straightOn(on);
  for (const l of ahead ? [on, ahead] : [on]) {
    const lookup = lookups[l.edge];
    if (lookup?.status !== "ready") continue;
    const sides = leftRight(l);
    left.push(...(lookup.directory[sides.left] ?? []));
    right.push(...(lookup.directory[sides.right] ?? []));
  }
  const unique = (stores: Store[]) =>
    stores
      .filter((s, i) => stores.findIndex((o) => o.name === s.name) === i)
      .slice(0, MAX_PER_SIDE);
  return { left: unique(left), right: unique(right) };
}
