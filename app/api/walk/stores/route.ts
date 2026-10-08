import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  crossStreet,
  EDGES,
  midpoint,
  NAMES,
  sidesOf,
  type Side,
} from "@/lib/walk/streets";
import type { Directory, Store } from "@/lib/walk/types";

// POST { edge } → { west?, east?, north?, south? }: the real businesses with
// storefronts on one block of the street grid (lib/walk/streets.ts), by side
// of the street, from Grounding with Google Maps. Avenues and Broadway have
// west/east sides; cross streets have north/south ones. The client turns
// those into left/right from the way you're walking.
//
// Only names backed by a Google Maps place in the response's grounding
// metadata are returned (with that place's Maps link), so nothing on screen is
// a name the model made up.
//
// A lookup takes ~30 s and occasionally times out upstream, so the client
// prefetches blocks ahead of the walker, each block is looked up once at a
// time (concurrent requests share it) and kept for CACHE_MS, and a failure is
// retried once.

const MODEL = process.env.WALK_MODEL || "gemini-3.7-flash";
const CACHE_MS = 30 * 60 * 1000;
const MAX_PER_SIDE = 8;

const cache = new Map<number, { at: number; directory: Directory }>();
const inflight = new Map<number, Promise<Directory>>();

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }
  let edge = -1;
  try {
    edge = Number(((await request.json()) as { edge?: unknown }).edge);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Number.isInteger(edge) || !EDGES[edge]) {
    return NextResponse.json({ error: "Unknown block" }, { status: 400 });
  }

  const hit = cache.get(edge);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.directory);

  let pending = inflight.get(edge);
  if (!pending) {
    pending = lookup(apiKey, edge)
      .catch(() => lookup(apiKey, edge)) // upstream deadlines are transient
      .finally(() => inflight.delete(edge));
    inflight.set(edge, pending);
  }
  try {
    const directory = await pending;
    cache.set(edge, { at: Date.now(), directory });
    return NextResponse.json(directory);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      { error: `Google Maps lookup failed: ${message}` },
      { status: 502 },
    );
  }
}

async function lookup(apiKey: string, edge: number): Promise<Directory> {
  const [a, b, nameIndex] = EDGES[edge];
  const street = NAMES[nameIndex];
  const sides = sidesOf(edge);
  const ends = [crossStreet(a, street), crossStreet(b, street)];
  const block =
    ends[0] && ends[1] ? `between ${ends[0]} and ${ends[1]}` : `near ${ends[0] ?? ends[1] ?? "here"}`;
  const mid = midpoint(edge);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Search Google Maps for the businesses with street-level storefronts on ${street} ${block} in Manhattan, New York (addresses on ${street} on that block). For each one, say which side of ${street} it is on: the ${sides[0]} side or the ${sides[1]} side.
Answer as two lines exactly:
${sides[0].toUpperCase()}: name; name; ...
${sides[1].toUpperCase()}: name; name; ...`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: { latLng: { latitude: mid.lat, longitude: mid.lng } },
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const places = (
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  )
    .map((chunk) => chunk.maps)
    .filter((maps) => maps?.title)
    .map((maps) => ({
      name: maps!.title!.replace(/ - Google Maps$/, "").trim(),
      uri: maps!.uri ?? null,
    }));
  const text = response.text ?? "";
  const side = (label: Side): Store[] => {
    const line = new RegExp(`^\\W*${label}\\W*:(.*)$`, "im").exec(text)?.[1] ?? "";
    const seen = new Set<string>();
    return line
      .split(";")
      .map((name) => groundedPlace(name, places))
      .filter((place): place is Store => {
        if (!place || seen.has(place.name)) return false;
        seen.add(place.name);
        return true;
      })
      .slice(0, MAX_PER_SIDE);
  };
  return { [sides[0]]: side(sides[0]), [sides[1]]: side(sides[1]) };
}

/** The Maps place a model-written name refers to, or null if none does. */
function groundedPlace(name: string, places: Store[]): Store | null {
  const key = normalize(name);
  if (key.length < 3) return null;
  return (
    places.find((place) => {
      const other = normalize(place.name);
      return other === key || other.includes(key) || key.includes(other);
    }) ?? null
  );
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
