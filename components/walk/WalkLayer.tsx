"use client";

// Everything about where you are on the walk, layered onto the stage: store
// names over the storefronts while the world streams, and the mini-map in the
// corner from the moment the world starts building. Its own component so the
// walk's frequent updates re-render only this subtree.

import type { WorldSession } from "@/components/happy-oyster/use-world-session";
import { useWalk } from "./use-walk";
import { useStoreLabels, type BlockLookup } from "./use-store-labels";
import { StoreLabelOverlay } from "./StoreLabelOverlay";
import { MiniMap } from "./MiniMap";

export function WalkLayer({ session }: { session: WorldSession }) {
  const walk = useWalk(session);
  const active = session.view.kind !== "browse";
  const stores = useStoreLabels(active, walk);
  if (!active) return null;
  return (
    <>
      {walk.traveling && (
        <StoreLabelOverlay labels={stores.labels} capturedAt={stores.capturedAt} />
      )}
      <MiniMap walk={walk} status={describeLookup(stores.current)} />
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
