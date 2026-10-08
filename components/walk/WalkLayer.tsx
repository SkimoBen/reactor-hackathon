"use client";

// Everything about where you are on the walk, layered onto the stage: store
// names over the storefronts while the world streams, the mini-map in the
// corner from the moment the world starts building, and the walk's own
// commands — "turn right onto 27th", "get back out onto the street"
// (use-navigate.ts) and "explore <somewhere>" (use-explore.ts). It also keeps
// the agents told where the character is (lib/walk/location.ts). Its own
// component so the walk's frequent updates re-render only this subtree.

import { useEffect, useRef, type MutableRefObject } from "react";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import { setWalkPlace } from "@/lib/walk/location";
import { crossStreet, shortStreet } from "@/lib/walk/streets";
import type { PlannedTurn } from "@/lib/walk/tracker";
import { useWalk } from "./use-walk";
import { useStoreLabels, type BlockLookup } from "./use-store-labels";
import { useExplore, type Exploring, type OverlayControls } from "./use-explore";
import { useNavigate, type Planned } from "./use-navigate";
import { StoreLabelOverlay } from "./StoreLabelOverlay";
import { MiniMap } from "./MiniMap";

export function WalkLayer({
  session,
  overlay,
  commands,
}: {
  session: WorldSession;
  overlay: OverlayControls;
  /** Set to this layer's command handler; it returns true when it took the
   * utterance, so the shell can route everything else to the agents. */
  commands: MutableRefObject<((utterance: string) => boolean) | null>;
}) {
  const plan = useRef<PlannedTurn | null>(null);
  const walk = useWalk(session, plan);
  const active = session.view.kind !== "browse";
  const stores = useStoreLabels(active, walk);
  const explore = useExplore(session, walk, stores.nearby, overlay);
  const navigate = useNavigate({
    session,
    walk,
    plan,
    storesOn: stores.storesOn,
    prefetch: stores.prefetch,
    overlay,
    explored: explore.opened,
  });

  const { handle: handleNavigate } = navigate;
  const { handle: handleExplore } = explore;
  useEffect(() => {
    commands.current = (utterance) => handleNavigate(utterance) || handleExplore(utterance);
    return () => {
      commands.current = null;
    };
  }, [commands, handleNavigate, handleExplore]);

  // Keep the agents grounded in the street the character is actually on.
  const { street, from, to } = walk.link;
  const facing = walk.activity === "facing";
  useEffect(() => {
    if (!walk.traveling) return setWalkPlace(null);
    const a = crossStreet(from, street);
    const b = crossStreet(to, street);
    setWalkPlace(
      `${street}${a && b ? ` between ${a} and ${b}` : ""} in NoMad / Midtown, Manhattan${
        facing ? " (at a storefront there)" : ""
      }`,
    );
  }, [walk.traveling, street, from, to, facing]);
  useEffect(() => () => setWalkPlace(null), []);

  if (!active) return null;
  return (
    <>
      {walk.traveling && (
        <StoreLabelOverlay labels={stores.labels} capturedAt={stores.capturedAt} />
      )}
      <MiniMap
        walk={walk}
        status={describeLookup(stores.current)}
        notes={[describePlan(navigate.planned), describeExploring(explore.exploring)]}
      />
    </>
  );
}

function describeLookup(lookup: BlockLookup | undefined): string | null {
  if (!lookup || lookup.status === "loading") return "finding stores…";
  if (lookup.status === "error") return "stores unavailable";
  const count = Object.values(lookup.directory).reduce(
    (sum, stores) => sum + (stores?.length ?? 0),
    0,
  );
  return `${count} stores here`;
}

function describePlan(planned: Planned | null): string | null {
  if (!planned) return null;
  return `Next: ${planned.side} onto ${shortStreet(planned.onto.street)}`;
}

function describeExploring(exploring: Exploring | null): string | null {
  if (!exploring) return null;
  if (exploring.status === "finding") return `Exploring ${exploring.query} · finding it…`;
  const place = exploring.place;
  const name = place?.name.split(/\s[-–|]\s/)[0] ?? exploring.query;
  return `Exploring ${name}${place?.side ? ` · on your ${place.side}` : ""} · turn in to open its site`;
}
