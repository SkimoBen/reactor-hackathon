// "Explore <somewhere>": the walker asks to go into a store, restaurant or
// other business. The app finds the real place and its website
// (/api/walk/explore), steers the world into it, and opens the site when the
// character turns in (components/walk/use-explore.ts). Shared by client and
// server.

import type { Store } from "./types";

// Filler before the verb: "let's", "I'm", "can we", "okay so"…
const LEAD = String.raw`(?:(?:let'?s|lets|let\s+us|let\s+me|lemme|i|i'?m|i\s+am|we|we'?re|we\s+are|i'?d\s+like\s+to|we'?d\s+like\s+to|i\s+want\s+to|want\s+to|i\s+wanna|wanna|i\s+need\s+to|need\s+to|i'?ll|i\s+will|we'?ll|gonna|going\s+to|can\s+we|could\s+we|can\s+i|could\s+i|we\s+should|should\s+we|please|go|ok(?:ay)?|alright|now|and|then|so|time\s+to)[\s,]+)*`;
// "explore X", or the ways people actually say it: "going to X", "head into
// X", "pop into X", "visit X", "check out X", "stop by X".
const VERB = String.raw`(explore|(?:go|going|goes|head|heading|walk|walking|step|stepping|pop|popping|duck|ducking|swing|swinging)\s+(?:in(?:to|side)?|to|over\s+to)|enter|entering|visit|visiting|check(?:ing)?\s+out|stop(?:ping)?\s+(?:by|at|in(?:to)?))`;
const EXPLORE = new RegExp(String.raw`^\s*${LEAD}${VERB}\s+(.+?)[\s.!?]*$`, "i");

// Only "explore" is unambiguous. "Going to buy a shirt" is a plan, not a
// place, and "head to 27th Street" is a walking direction.
const NOT_A_PLACE =
  /^(?:buy|get|order|grab|eat|have|try|see|look|find|pick|make|take|turn|go|walk|head|cross|keep|stop|sit|pay|book|do|be|leave|exit|left|right|back|out|outside|home|the\s+(?:left|right|corner|end))\b/i;
const STREETLIKE =
  /\b(?:street|st|avenue|ave|broadway|corner|intersection|block|crosswalk|sidewalk|left|right|north|south|east|west)\.?$/i;

/** What to explore, if the utterance asks to go into somewhere. */
export function parseExplore(utterance: string): string | null {
  const match = EXPLORE.exec(utterance);
  if (!match) return null;
  const target = match[2]
    .replace(/^(?:inside|into|in)\s+/i, "")
    .replace(/\s+(?:please|now)$/i, "")
    .trim();
  const explicit = /^explore$/i.test(match[1]);
  if (!explicit && (NOT_A_PLACE.test(target) || STREETLIKE.test(target)))
    return null;
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
