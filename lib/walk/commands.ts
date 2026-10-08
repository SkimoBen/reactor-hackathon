// Walking directions the user can speak or type, handled by the walk itself
// rather than the agents (the Concierge leaves "turn left" alone):
//
//   "turn right onto 27th", "make a left on West 28th Street",
//   "take a right onto Fifth Avenue", "turn left"   → turn
//   "get back out onto the street", "leave the store" → exit
//
// A turn names a street as people say it; resolveStreet() maps that onto the
// street grid's names, and planTurn() finds where along the way ahead you can
// make that turn. Pure, shared by client and tests.

import { angleDiff, NAMES, linksAt, type Link } from "./streets";
import { straightOn, type Track } from "./tracker";

export type WalkCommand =
  | { kind: "turn"; side: "left" | "right"; street: string | null }
  | { kind: "exit" };

const TURN =
  /\b(?:(?:turn|go|head|veer)\s+|(?:make|take|hang)\s+a\s+)(left|right)\b(?:\s*,?\s*(?:onto|on to|on|into|at|down|up|to)\s+(.+?))?[\s.!?]*$/i;
const EXIT =
  /\b(?:(?:get|go|head|step|walk|come|move)\s+(?:back\s+)?(?:out(?:side)?|outdoors)\b|leave\s+(?:the\s+)?(?:store|shop|restaurant|place|building|caf[eé]|bar)\b|(?:go\s+)?back\s+(?:out\s+)?(?:on\s*)?to\s+the\s+(?:street|sidewalk)\b|exit\s+(?:the\s+)?(?:store|shop|restaurant|place|building))/i;

export function parseCommand(utterance: string): WalkCommand | null {
  const turn = TURN.exec(utterance);
  if (turn) {
    const street = turn[2]?.replace(/^the\s+/i, "").trim() || null;
    return { kind: "turn", side: turn[1].toLowerCase() as "left" | "right", street };
  }
  return EXIT.test(utterance) ? { kind: "exit" } : null;
}

const UNITS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
const TEENS = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const ORDINAL_TENS: Record<string, number> = { twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50 };
const CARDINAL_UNITS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "27th", "27", "twenty-seventh", "Fifth" → 27, 27, 27, 5. */
function streetNumber(words: string): number | null {
  const digits = /\b(\d{1,3})(?:st|nd|rd|th)?\b/.exec(words);
  if (digits) return Number(digits[1]);
  const text = words.toLowerCase().replace(/-/g, " ");
  for (const [word, n] of Object.entries(ORDINAL_TENS)) if (new RegExp(`\\b${word}\\b`).test(text)) return n;
  for (const [word, tens] of Object.entries(TENS)) {
    const m = new RegExp(`\\b${word}\\s+(\\w+)`).exec(text);
    if (m) {
      const unit = UNITS.indexOf(m[1]);
      if (unit > 0) return tens + unit;
      const cardinal = CARDINAL_UNITS.indexOf(m[1]);
      if (cardinal > 0) return tens + cardinal;
    }
  }
  const teen = TEENS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (teen >= 0) return 10 + teen;
  const unit = UNITS.findIndex((w, i) => i > 0 && new RegExp(`\\b${w}\\b`).test(text));
  return unit > 0 ? unit : null;
}

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
}

/** The street-grid names a spoken street could mean, best first. */
export function resolveStreet(spoken: string): string[] {
  const text = spoken.toLowerCase();
  if (/americas/.test(text)) return ["6th Avenue"];
  const named = NAMES.filter((name) => {
    const word = name.toLowerCase().replace(/ (avenue|street|alley)$/, "");
    return !/\d/.test(word) && word.length > 3 && text.includes(word);
  });
  if (named.length) return named;
  const n = streetNumber(text);
  if (n === null) return [];
  const avenue = /\bav(e|enue)?\b/.test(text) || (!/\b(st|street)\b/.test(text) && n < 10);
  const want = avenue
    ? [`${ordinal(n)} Avenue`]
    : [`West ${ordinal(n)} Street`, `East ${ordinal(n)} Street`];
  return want.filter((name) => NAMES.includes(name));
}

export interface TurnPlan {
  /** The intersection to turn at. */
  node: number;
  /** The block you'll be on after the turn. */
  onto: Link;
  side: "left" | "right";
  /** How far ahead of you the corner is (negative: just behind). */
  distanceM: number;
}

const MAX_BLOCKS_AHEAD = 8;
const SIDE_MIN_DEG = 30;
const JUST_PASSED_M = 15;

/**
 * Where you can turn `side` onto one of `streets` (any street, if none named):
 * the first such corner along the street ahead, or the one you just passed.
 */
export function planTurn(track: Track, side: "left" | "right", streets: string[]): TurnPlan | null {
  const fits = (l: Link, from: Link) => {
    if (l.edge === from.edge) return false;
    if (streets.length && !streets.includes(l.street)) return false;
    const rel = angleDiff(l.bearing, from.bearing);
    return side === "right" ? rel > SIDE_MIN_DEG && rel < 150 : rel < -SIDE_MIN_DEG && rel > -150;
  };
  if (track.along < JUST_PASSED_M) {
    const behind = linksAt(track.link.from).find((l) => fits(l, track.link));
    if (behind) return { node: track.link.from, onto: behind, side, distanceM: -track.along };
  }
  let on: Link | null = track.link;
  let distance = track.link.length - track.along;
  for (let i = 0; on && i < MAX_BLOCKS_AHEAD; i++) {
    const current: Link = on;
    const onto = linksAt(current.to).find((l) => fits(l, current));
    if (onto) return { node: current.to, onto, side, distanceM: distance };
    on = straightOn(current);
    if (on) distance += on.length;
  }
  return null;
}
