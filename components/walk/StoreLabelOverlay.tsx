"use client";

// Store-name tags pinned over the storefronts in the live world, in the style
// of Apple Maps' place labels: a frosted pill over each storefront with a short
// stem down to its top edge. Each tag links to the store on Google Maps.
//
// Boxes arrive on the captured frame (0–1000 of the video's own size), while
// the <video> fills the stage with object-cover, so they are mapped through
// the same crop. Labels trail the moving camera by a few seconds and fade out
// once they're LABEL_TTL_MS old without a refresh.

import { useEffect, useRef, useState } from "react";
import type { PlacedLabel } from "./use-store-labels";

const LABEL_TTL_MS = 9_000;
// Tags stay below the attribution chip in the top-left corner.
const TOP_CLEARANCE = 56;

interface Frame {
  cw: number;
  ch: number;
  vw: number;
  vh: number;
}

export function StoreLabelOverlay({
  labels,
  capturedAt,
}: {
  labels: PlacedLabel[];
  capturedAt: number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const measure = () => {
      const el = layer.current;
      const video = document.querySelector<HTMLVideoElement>("video[data-ho-video]");
      if (!el || !video?.videoWidth) return setFrame(null);
      const next = {
        cw: el.clientWidth,
        ch: el.clientHeight,
        vw: video.videoWidth,
        vh: video.videoHeight,
      };
      setFrame((prev) =>
        prev &&
        prev.cw === next.cw &&
        prev.ch === next.ch &&
        prev.vw === next.vw &&
        prev.vh === next.vh
          ? prev
          : next,
      );
    };
    measure();
    const id = setInterval(() => {
      measure();
      setNow(Date.now());
    }, 1000);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fresh = now - capturedAt < LABEL_TTL_MS;
  const placed = frame
    ? declutter(
        labels
          .map((label) => place(label, frame))
          .filter((tag): tag is Tag => tag !== null),
      )
    : [];

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[5]">
      {placed.map((tag) => (
        <a
          key={tag.name}
          href={tag.uri ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={`${tag.name} on Google Maps`}
          style={{ left: tag.x, top: tag.y }}
          className={`absolute flex -translate-x-1/2 -translate-y-full flex-col items-center transition-[opacity,left,top] duration-700 ${
            fresh ? "opacity-100" : "opacity-0"
          } ${tag.uri ? "pointer-events-auto" : ""}`}
        >
          <span className="flex max-w-[220px] items-center gap-1.5 rounded-full bg-white/80 py-1 pl-1.5 pr-3 text-[12px] font-semibold tracking-[-0.01em] text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06] backdrop-blur-xl backdrop-saturate-150">
            <span
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white ${
                tag.side === "left" ? "bg-[#0071e3]" : "bg-[#ff9f0a]"
              }`}
            >
              <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
                <path d="M2 6.5 3.2 2h9.6L14 6.5a2 2 0 0 1-3.5 1.3A2 2 0 0 1 8 8.8a2 2 0 0 1-2.5-1A2 2 0 0 1 2 6.5Zm1 3.3V14h10V9.8a3 3 0 0 1-2.5-.4A3 3 0 0 1 8 10a3 3 0 0 1-2.5-.6 3 3 0 0 1-2.5.4Z" />
              </svg>
            </span>
            <span className="truncate">{shortName(tag.name)}</span>
          </span>
          <span
            className="w-px bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.4)]"
            style={{ height: 12 + tag.lift }}
          />
        </a>
      ))}
      {placed.length > 0 && fresh && (
        <p className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/90 backdrop-blur-xl sm:left-6 sm:top-6">
          Store names: <span translate="no">Google Maps</span>
        </p>
      )}
    </div>
  );
}

type Tag = PlacedLabel & { x: number; y: number; lift: number };

// Map a label's box on the frame to stage pixels through object-cover's crop,
// anchored at the top centre of the storefront.
function place(label: PlacedLabel, { cw, ch, vw, vh }: Frame): Tag | null {
  const scale = Math.max(cw / vw, ch / vh);
  const rw = vw * scale;
  const rh = vh * scale;
  const [ymin, xmin, , xmax] = label.box;
  const x = (cw - rw) / 2 + (((xmin + xmax) / 2) * rw) / 1000;
  const y = (ch - rh) / 2 + (ymin * rh) / 1000;
  if (x < 24 || x > cw - 24) return null; // cropped off the stage
  return { ...label, x, y: Math.max(TOP_CLEARANCE + TAG_HEIGHT, y), lift: 0 };
}

const TAG_HEIGHT = 30;

// Neighbouring storefronts put their tags on top of each other; raise a tag
// (lengthening its stem) until it clears the ones already placed.
function declutter(tags: Tag[]): Tag[] {
  const placed: (Tag & { width: number })[] = [];
  for (const tag of [...tags].sort((a, b) => a.x - b.x)) {
    const width = Math.min(220, 34 + shortName(tag.name).length * 6.8);
    let lift = 0;
    const clashes = () =>
      placed.some(
        (other) =>
          Math.abs(other.x - tag.x) < (other.width + width) / 2 + 6 &&
          Math.abs(other.y - other.lift - (tag.y - lift)) < TAG_HEIGHT,
      );
    while (clashes() && tag.y - lift - 2 * TAG_HEIGHT > TOP_CLEARANCE) lift += TAG_HEIGHT;
    // The stem still ends at the storefront (tag.y); only the pill rises.
    placed.push({ ...tag, lift, width });
  }
  return placed;
}

// Maps titles often carry a tagline: "sweetgreen - Healthy Salads, Wraps…".
function shortName(name: string): string {
  return name.split(/\s[-–|]\s/)[0].trim();
}
