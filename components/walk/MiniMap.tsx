"use client";

// The "where am I" window in the stage's bottom-right corner: a small map that
// follows the character, an arrow pointing where they face (it swings when they
// turn, even standing still), the trail they've walked, the street and block,
// what they're doing, and the walking pace (default 16 min/mile).
//
// Leaflet on OpenStreetMap's standard tiles, which need no API key (CARTO's
// basemaps now do), under OSM's tile usage policy: attribution shown, light
// use. It's display only — no dragging or zooming — and loads in the browser
// after mount, since Leaflet touches `window`.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import { crossStreet, shortStreet } from "@/lib/walk/streets";
import { PACE_OPTIONS_MIN_PER_MILE, type Walk } from "./use-walk";

const ZOOM = 17;
const BLUE = "#0071e3";
const AT_CORNER_M = 12;
const TURN_NOTICE_MS = 5000;

const ARROW = `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;transition:transform .25s ease-out">
  <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="white" opacity=".9"/><path d="M13 4 20 20 13 16.5 6 20Z" fill="${BLUE}"/></svg>
</div>`;

export function MiniMap({
  walk,
  status,
  notes,
}: {
  walk: Walk;
  status: string | null;
  /** What the walk is heading for: a planned turn, a place to explore. */
  notes: (string | null)[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const layers = useRef<{ map: LeafletMap; trail: Polyline; marker: Marker } | null>(null);
  const start = useRef(walk.position);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || layers.current) return;
      const { lat, lng } = start.current;
      const map = L.map(container.current, {
        center: [lat, lng],
        zoom: ZOOM,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const trail = L.polyline([], { color: BLUE, weight: 4, opacity: 0.8 }).addTo(map);
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ html: ARROW, className: "", iconSize: [26, 26], iconAnchor: [13, 13] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      layers.current = { map, trail, marker };
    });
    return () => {
      cancelled = true;
      layers.current?.map.remove();
      layers.current = null;
    };
  }, []);

  // Follow the character: position, facing, and the trail behind.
  const { lat, lng } = walk.position;
  useEffect(() => {
    const current = layers.current;
    if (!current) return;
    current.marker.setLatLng([lat, lng]);
    const arrow = current.marker.getElement()?.firstElementChild as HTMLElement | null;
    if (arrow) arrow.style.transform = `rotate(${walk.heading}deg)`;
    current.trail.setLatLngs(walk.trail.map((p) => [p.lat, p.lng]));
    current.map.panTo([lat, lng], { animate: true, duration: 0.4 });
  }, [lat, lng, walk.heading, walk.trail]);

  const debug = useDebugReadout(walk);

  return (
    <div className="absolute bottom-24 right-3 z-10 w-48 sm:bottom-6 sm:right-6 sm:w-64">
      <div className="overflow-hidden rounded-[20px] bg-white/75 shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
        <div className="px-3.5 pb-2 pt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="shrink-0 text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {shortStreet(walk.link.street)}
            </span>
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              {block(walk)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              {doing(walk)}
              {status && <> · {status}</>}
            </span>
            <select
              value={walk.pace}
              onChange={(event) => walk.setPace(Number(event.target.value))}
              title="Walking pace"
              className="shrink-0 rounded-[8px] bg-fill px-1.5 py-0.5 text-[11px] font-medium text-foreground outline-none"
            >
              {PACE_OPTIONS_MIN_PER_MILE.map((pace) => (
                <option key={pace} value={pace}>
                  {pace} min/mi
                </option>
              ))}
            </select>
          </div>
          {notes.filter(Boolean).map((note) => (
            <div key={note} className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-primary">
              {note}
            </div>
          ))}
          {debug && (
            <div className="mt-1 font-mono text-[10px] tabular-nums text-tertiary">{debug}</div>
          )}
        </div>
        <div ref={container} className="h-28 w-full sm:h-40" />
      </div>
    </div>
  );
}

// "at W 27th St" near a corner, otherwise "W 26th St → W 27th St".
function block(walk: Walk): string {
  const { link, along } = walk;
  const from = crossStreet(link.from, link.street);
  const to = crossStreet(link.to, link.street);
  if (to && link.length - along < AT_CORNER_M) return `at ${shortStreet(to)}`;
  if (from && along < AT_CORNER_M) return `at ${shortStreet(from)}`;
  if (from && to) return `${shortStreet(from)} → ${shortStreet(to)}`;
  return "";
}

function doing(walk: Walk): string {
  const turned = walk.turned;
  if (turned && Date.now() - turned.at < TURN_NOTICE_MS) {
    return `Turned ${turned.side} onto ${shortStreet(turned.street)}`;
  }
  if (!walk.live) return `${Math.round(walk.walkedM)} m walked`;
  if (walk.activity === "facing") return "At a storefront";
  if (walk.activity === "stopped") return "Stopped";
  return `Walking · ${Math.round(walk.walkedM)} m`;
}

// ?walkdebug in the URL shows what the motion reader sees, for tuning
// use-walk.ts's thresholds against the real world.
function useDebugReadout(walk: Walk): string | null {
  const enabled = useRef<boolean | null>(null);
  if (enabled.current === null && typeof window !== "undefined") {
    enabled.current = new URLSearchParams(window.location.search).has("walkdebug");
  }
  if (!enabled.current || !walk.reading) return null;
  const { divergence, yawRate, quality } = walk.reading;
  return `exp ${divergence.toFixed(3)}/s · turn ${yawRate.toFixed(0)}°/s · fit ${Math.round(quality * 100)}% · hdg ${Math.round(walk.heading)}°`;
}
