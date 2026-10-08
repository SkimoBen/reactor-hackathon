// "Explore <somewhere>": the walker asks to go into a store, restaurant or
// other business. The app finds the real place and its website
// (/api/walk/explore), steers the world into it, and opens the site when the
// character turns in (components/walk/use-explore.ts). Shared by client and
// server.

import type { Store } from "./types";

/** What to explore, if the utterance asks to explore something. */
export function parseExplore(utterance: string): string | null {
  const match =
    /^\s*(?:(?:let'?s|lets|let us|i want to|i'd like to|can we|could we|we should|please|go|and|ok(?:ay)?|now)[\s,]+)*explore\s+(.+?)[\s.!?]*$/i.exec(
      utterance,
    );
  if (!match) return null;
  const target = match[1]
    .replace(/^(?:inside|into|in)\s+/i, "")
    .replace(/\s+(?:please|now)$/i, "")
    .trim();
  return target.length >= 2 && target.length <= 80 ? target : null;
}

/** Where the walker is, for finding what they mean. */
export interface ExploreContext {
  query: string;
  /** The street they're walking, e.g. "Broadway". */
  street: string;
  /** The cross streets either end of the block, when known. */
  between: [string | null, string | null];
  lat: number;
  lng: number;
  /** Storefronts on this block, split by the walker's left and right. */
  left: Store[];
  right: Store[];
}

export interface ExplorePlace {
  name: string;
  address: string | null;
  /** Which side of the street the walker will find it on, if on this block. */
  side: "left" | "right" | null;
  /** Its website, or its Google Maps page when it has none we can load. */
  url: string;
  embeddable: boolean;
  mapsUri: string | null;
}
