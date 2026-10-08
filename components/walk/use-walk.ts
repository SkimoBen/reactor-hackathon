"use client";

// Where the character is, from how the live world's camera moves.
//
// ~10 times a second the current video frame is shrunk to grey and compared
// with the last one (lib/walk/flow.ts): the scene expanding means walking,
// sliding sideways means turning. Those feed the street-map tracker
// (lib/walk/tracker.ts), which keeps you on real streets — stopping when you
// stop, turning onto the cross street when you turn at a corner, holding when
// you face a storefront. Speed while walking is the chosen pace (default 16
// min/mile). Every travel opens on the start frame, so each one starts back at
// Broadway & West 26th Street.
//
// Assumptions worth knowing when tuning: the camera's horizontal field of view
// (FOV_DEG) converts image shift into degrees turned, and WALK_ON / WALK_OFF
// are the expansion rates that count as walking. Add ?walkdebug to the URL to
// see the live readings on the mini-map.

import { useCallback, useEffect, useRef, useState } from "react";
import { FLOW_HEIGHT, FLOW_WIDTH, estimateFlow, toGray } from "@/lib/walk/flow";
import {
  positionOf,
  startTrack,
  step,
  type PlannedTurn,
  type Track,
} from "@/lib/walk/tracker";
import { distanceBetween, type LatLng } from "@/lib/walk/streets";
import type { WorldSession } from "@/components/happy-oyster/use-world-session";

export const DEFAULT_PACE_MIN_PER_MILE = 16;
export const PACE_OPTIONS_MIN_PER_MILE = [12, 14, 16, 18, 20, 25];

const SAMPLE_MS = 100;
const PUBLISH_MS = 250;
const FOV_DEG = 70;
const DEG_PER_PX = FOV_DEG / FLOW_WIDTH;
const YAW_DEADBAND_PX = 0.2;
const WALK_ON = 0.06; // expansion per second that starts "walking"
const WALK_OFF = 0.03; // …and below which it stops
const SMOOTHING_S = 0.8;
const MIN_QUALITY = 0.5;
// Walking expands the scene ~1–3% per frame pair; far more is a cut or a jump.
const MAX_DIVERGENCE_PER_FRAME = 0.08;
// A frame unchanged this long is standing still (or a frozen stream), not
// "no new frame yet".
const FROZEN_MS = 500;
const TRAIL_STEP_M = 3;
const MAX_TRAIL = 1500;

export interface MotionReading {
  /** Smoothed expansion rate, per second. */
  divergence: number;
  /** Turn rate, degrees per second (positive = right). */
  yawRate: number;
  /** Share of measured blocks agreeing with the motion fit. */
  quality: number;
}

export interface Walk extends Track {
  /** A travel is starting or live. */
  traveling: boolean;
  /** The video is streaming and its motion is being read. */
  live: boolean;
  position: LatLng;
  /** Where you've been this walk. */
  trail: LatLng[];
  /** Walking pace in minutes per mile. */
  pace: number;
  setPace: (minPerMile: number) => void;
  reading: MotionReading | null;
  /** Change the tracked state (e.g. leave a storefront); applied on the next sample. */
  apply: (edit: (track: Track) => Track) => void;
}

export function useWalk(
  session: WorldSession,
  /** A turn the user asked for, if any (lib/walk/commands.ts). */
  plan: { current: PlannedTurn | null },
): Walk {
  const { view, client } = session;
  const traveling = view.kind === "traveling";
  const live =
    view.kind === "traveling" && view.live && client.travelStatus !== "paused";
  const [pace, setPace] = useState(DEFAULT_PACE_MIN_PER_MILE);
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const [track, setTrack] = useState<Track>(startTrack);
  // The sampling loop carries on from wherever the last published track is.
  const trackRef = useRef(track);
  trackRef.current = track;
  const [trail, setTrail] = useState<LatLng[]>(() => [positionOf(startTrack())]);
  const [reading, setReading] = useState<MotionReading | null>(null);
  const edits = useRef<((track: Track) => Track)[]>([]);

  useEffect(() => {
    if (!traveling) return;
    const fresh = startTrack();
    setTrack(fresh);
    setTrail([positionOf(fresh)]);
  }, [traveling]);

  useEffect(() => {
    if (!live) {
      setReading(null);
      return;
    }
    const sampler = new MotionSampler();
    let current = trackRef.current;
    let lastPublish = 0;
    const id = setInterval(() => {
      const video = document.querySelector<HTMLVideoElement>("video[data-ho-video]");
      const sample = video ? sampler.sample(video) : null;
      const edited = edits.current.length > 0;
      for (const edit of edits.current.splice(0)) current = edit(current);
      if (!sample && !edited) return;
      if (sample) {
        const speed = 1609.344 / (paceRef.current * 60);
        current = step(
          current,
          { dt: sample.dt, walking: sample.walking, speed, yaw: sample.yaw },
          Date.now(),
          plan.current,
        );
      }
      const now = performance.now();
      if (!edited && now - lastPublish < PUBLISH_MS) return;
      lastPublish = now;
      const published = current;
      setTrack(published);
      if (sample) setReading(sample.reading);
      setTrail((trail) => {
        const here = positionOf(published);
        const last = trail[trail.length - 1];
        if (last && distanceBetween(last, here) < TRAIL_STEP_M) return trail;
        return [...trail, here].slice(-MAX_TRAIL);
      });
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [live, plan]);

  const apply = useCallback((edit: (track: Track) => Track) => {
    edits.current.push(edit);
  }, []);

  return {
    ...track,
    traveling,
    live,
    position: positionOf(track),
    trail,
    pace,
    setPace,
    reading,
    apply,
  };
}

interface Sample {
  dt: number;
  walking: boolean;
  yaw: number;
  reading: MotionReading;
}

// Reads camera motion off the <video> one frame pair at a time.
class MotionSampler {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D | null;
  private prev: Uint8Array | null = null;
  private prevAt = 0;
  private divergence = 0;
  private walking = false;

  constructor() {
    this.canvas.width = FLOW_WIDTH;
    this.canvas.height = FLOW_HEIGHT;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  sample(video: HTMLVideoElement): Sample | null {
    if (!this.ctx || video.readyState < 2 || !video.videoWidth) return null;
    this.ctx.drawImage(video, 0, 0, FLOW_WIDTH, FLOW_HEIGHT);
    const gray = toGray(this.ctx.getImageData(0, 0, FLOW_WIDTH, FLOW_HEIGHT).data);
    const now = performance.now();
    const prev = this.prev;
    if (!prev) {
      [this.prev, this.prevAt] = [gray, now];
      return null;
    }
    if (sameFrame(prev, gray)) {
      // No new frame yet: keep the older one so the next pair spans real
      // motion — unless the picture has been frozen a while, which is no motion.
      if (now - this.prevAt < FROZEN_MS) return null;
      const dt = (now - this.prevAt) / 1000;
      this.prevAt = now;
      return this.still(Math.min(dt, 1));
    }
    const dt = (now - this.prevAt) / 1000;
    this.prev = gray;
    this.prevAt = now;
    const flow = estimateFlow(prev, gray);
    const quality = flow ? flow.inliers / flow.samples : 0;
    if (
      !flow ||
      quality < MIN_QUALITY ||
      Math.abs(flow.divergence) > MAX_DIVERGENCE_PER_FRAME ||
      dt <= 0 ||
      dt > 1
    ) {
      // A cut or an unreadable frame: hold the last state, no turn.
      return { dt: Math.min(dt, 1), walking: this.walking, yaw: 0, reading: this.reading(0, quality) };
    }
    const alpha = 1 - Math.exp(-dt / SMOOTHING_S);
    this.divergence += alpha * (flow.divergence / dt - this.divergence);
    this.walking = this.walking ? this.divergence > WALK_OFF : this.divergence > WALK_ON;
    // Content sliding left = the camera turning right.
    const yaw = Math.abs(flow.shiftX) < YAW_DEADBAND_PX ? 0 : -flow.shiftX * DEG_PER_PX;
    return { dt, walking: this.walking, yaw, reading: this.reading(yaw / dt, quality) };
  }

  private still(dt: number): Sample {
    this.divergence *= Math.exp(-dt / SMOOTHING_S);
    this.walking = this.walking ? this.divergence > WALK_OFF : this.divergence > WALK_ON;
    return { dt, walking: this.walking, yaw: 0, reading: this.reading(0, 1) };
  }

  private reading(yawRate: number, quality: number): MotionReading {
    return { divergence: this.divergence, yawRate, quality };
  }
}

function sameFrame(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 7) diff += Math.abs(a[i] - b[i]);
  return diff / (a.length / 7) < 0.5;
}
