// Where the character is on the street map, from how the camera moves.
//
// The world reports no position, so this map-matches the motion read off the
// video (lib/walk/flow.ts) onto the street grid (lib/walk/streets.ts), the way
// a car's navigation snaps dead reckoning to roads:
//
//   - walking moves you along the block you're on, at the walking pace;
//     stopping stops you;
//   - turning (the camera's heading swinging away from the street) near an
//     intersection puts you on the cross street on that side;
//   - turning mid-block means facing a storefront: you stay put until you
//     turn back — unless you keep walking that way, in which case the world's
//     corner is a little off the map's and you take the nearest one;
//   - facing back down the block means you turned around;
//   - while you walk straight, the street's direction slowly corrects drift in
//     the heading;
//   - when the user has asked for a particular turn ("right onto 27th"), a
//     turn that way is taken at that corner, wherever the world started it.
// Pure: one step per motion sample, no clocks or DOM.

import {
  angleDiff,
  link,
  linksAt,
  pointOn,
  START_LINK,
  type LatLng,
  type Link,
} from "./streets";

// A turn snaps onto a corner this close ahead of you, or this close behind
// (you just crossed it); any further back, turning means facing a storefront.
const CORNER_AHEAD_M = 20;
const CORNER_BEHIND_M = 8;
const TURN_DEG = 50;
const MATCH_DEG = 40;
const REVERSE_DEG = 140;
const STRAIGHT_DEG = 25;
const SETTLE_PER_S = 0.25;
const OFF_STREET_WALK_S = 3;

/** "facing": turned toward a storefront mid-block. */
export type Activity = "walking" | "stopped" | "facing";

export interface Track {
  /** The block you're on, in the direction you're walking it. */
  link: Link;
  /** Metres from link.from. */
  along: number;
  /** Where the camera faces, degrees clockwise from true north. */
  heading: number;
  activity: Activity;
  /** The last turn onto another street. */
  turned: { side: "left" | "right"; street: string; at: number } | null;
  walkedM: number;
  /** How long you've kept walking while facing off the street. */
  offStreetWalkS: number;
}

export interface Motion {
  /** Seconds since the last sample. */
  dt: number;
  walking: boolean;
  /** Metres per second while walking. */
  speed: number;
  /** Heading change since the last sample, degrees; positive turns right. */
  yaw: number;
}

/** A turn the user asked for: at this intersection, onto this block. */
export interface PlannedTurn {
  node: number;
  onto: Link;
  side: "left" | "right";
}

export function startTrack(): Track {
  return {
    link: START_LINK,
    along: 0,
    heading: START_LINK.bearing,
    activity: "stopped",
    turned: null,
    walkedM: 0,
    offStreetWalkS: 0,
  };
}

export function positionOf(track: Track): LatLng {
  return pointOn(track.link, track.along);
}

export function step(
  track: Track,
  motion: Motion,
  now: number,
  plan: PlannedTurn | null = null,
): Track {
  let { link: on, along, turned, walkedM } = track;
  let heading = (track.heading + motion.yaw + 360) % 360;
  let rel = angleDiff(heading, on.bearing);

  if (Math.abs(rel) > REVERSE_DEG) {
    on = link(on.to, on.from);
    along = on.length - along;
    rel = angleDiff(heading, on.bearing);
  }

  if (Math.abs(rel) > TURN_DEG) {
    // The asked-for turn: the world often starts it before the real corner,
    // so put you at that corner and on that street.
    if (plan && rel > 0 === (plan.side === "right")) {
      const ahead = distanceTo(on, along, plan.node);
      if (ahead !== null) {
        const walked = { ...track, walkedM: walkedM + Math.max(0, ahead) };
        return turnOnto(walked, plan.onto, heading, rel, motion, now);
      }
    }
    const corner = cornerNear(on, along);
    const onto = corner === null ? null : bestLink(corner, heading, on.edge);
    if (onto) return turnOnto(track, onto, heading, rel, motion, now);
    const offStreetWalkS = motion.walking ? track.offStreetWalkS + motion.dt : 0;
    if (offStreetWalkS > OFF_STREET_WALK_S) {
      const nearest = along < on.length / 2 ? on.from : on.to;
      const taken = bestLink(nearest, heading, on.edge);
      if (taken) return turnOnto(track, taken, heading, rel, motion, now);
    }
    return { ...track, link: on, along, heading, activity: "facing", offStreetWalkS };
  }

  if (!motion.walking) {
    return { ...track, link: on, along, heading, activity: "stopped", offStreetWalkS: 0 };
  }
  // Gently, and only while walking, so a slow turn toward a storefront isn't
  // straightened out before it registers.
  if (Math.abs(rel) < STRAIGHT_DEG) {
    heading = (heading - rel * Math.min(1, SETTLE_PER_S * motion.dt) + 360) % 360;
  }
  const moved = motion.speed * motion.dt;
  walkedM += moved;
  along += moved;
  while (along >= on.length) {
    const next = bestLink(on.to, heading, on.edge);
    if (!next) {
      along = on.length; // the street ends: wait at the corner for a turn
      break;
    }
    along -= on.length;
    on = next;
  }
  return { link: on, along, heading, activity: "walking", turned, walkedM, offStreetWalkS: 0 };
}

/** Back out of a storefront onto the sidewalk, facing the way you were walking. */
export function leaveStorefront(track: Track): Track {
  if (track.activity !== "facing") return track;
  return { ...track, heading: track.link.bearing, activity: "stopped", offStreetWalkS: 0 };
}

/** Metres along the street ahead to `node` (negative if just passed), or null. */
export function distanceTo(on: Link, along: number, node: number): number | null {
  if (node === on.from && along < 30) return -along;
  let current: Link | null = on;
  let distance = on.length - along;
  for (let i = 0; current && i < 8; i++) {
    if (current.to === node) return distance;
    current = straightOn(current);
    if (current) distance += current.length;
  }
  return null;
}

/** The block continuing straight on from the end of this one, if any. */
export function straightOn(on: Link): Link | null {
  return bestLink(on.to, on.bearing, on.edge);
}

function turnOnto(
  track: Track,
  onto: Link,
  heading: number,
  rel: number,
  motion: Motion,
  now: number,
): Track {
  // The measured turn is approximate; meet the new street halfway so drift
  // correction can take it from there.
  return {
    ...track,
    link: onto,
    along: 0,
    heading: (onto.bearing + angleDiff(heading, onto.bearing) / 2 + 360) % 360,
    activity: motion.walking ? "walking" : "stopped",
    turned: { side: rel > 0 ? "right" : "left", street: onto.street, at: now },
    offStreetWalkS: 0,
  };
}

function cornerNear(on: Link, along: number): number | null {
  if (on.length - along < CORNER_AHEAD_M) return on.to;
  if (along < CORNER_BEHIND_M) return on.from;
  return null;
}

// The block leaving `node` closest to `heading` (within MATCH_DEG), other
// than the one you're on.
function bestLink(node: number, heading: number, currentEdge: number): Link | null {
  let best: Link | null = null;
  let bestDiff = MATCH_DEG;
  for (const candidate of linksAt(node)) {
    if (candidate.edge === currentEdge) continue;
    const diff = Math.abs(angleDiff(candidate.bearing, heading));
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}
