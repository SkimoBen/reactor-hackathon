import {
  ADVENTURE_MAX_EXPERIENCE_SEC,
  type CreateWorldParams,
  type HappyOysterMode,
} from "@reactor-models/happy-oyster";

/** Countdown length per experience mode (seconds): 2 min Adventure, 3 min
 * Directing. A live travel reports its own budget, so these size the clock
 * while the stream opens, and for Directing travels. */
export const TRAVEL_SECONDS: Record<1 | 2, number> = {
  1: ADVENTURE_MAX_EXPERIENCE_SEC,
  2: 180,
};

// The experience is fixed per session — each mode is its own Reactor model —
// so every intent carries the mode the session must connect with, and the
// create params carry only that mode's own knobs (no mode field).
/** One thing to do with the session: build a new world, or attach an existing one. */
export type WorldIntent =
  | {
      kind: "create";
      mode: HappyOysterMode;
      params: CreateWorldParams;
      title: string;
    }
  | {
      kind: "attach";
      mode: HappyOysterMode;
      encryptedWorldId: string;
      title: string;
    };
