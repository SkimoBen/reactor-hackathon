import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { checkEmbeddable } from "@/lib/agent/concierge";
import type { ExploreContext, ExplorePlace } from "@/lib/walk/explore";
import type { Store } from "@/lib/walk/types";

// POST ExploreContext → ExplorePlace: which real business the walker means by
// "explore <query>", and its website. In steps, cheapest first (the Gemini API
// won't combine Maps and Search grounding in one request):
//
//   1. A storefront on the walker's block whose name matches — instant.
//   2. Otherwise Gemini picks the block's storefront that fits the description
//      ("the wine bar") — no tools, a couple of seconds.
//   3. Otherwise Grounding with Google Maps finds the closest matching
//      business (~30 s).
//   4. Grounding with Google Search finds that business's own website.
//
// Nothing is taken on trust: the business is always one of the block's
// Maps-backed storefronts or a place from Maps grounding, and the website must
// actually load — otherwise the place's Google Maps page stands in. Whether
// the page can be framed is checked the same way the Concierge does.

const MODEL = process.env.WALK_MODEL || "gemini-3.7-flash";
const FETCH_TIMEOUT_MS = 6000;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }
  let input: ExploreContext;
  try {
    input = (await request.json()) as ExploreContext;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = String(input.query ?? "").trim().slice(0, 80);
  if (!query || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return NextResponse.json({ error: "query, lat and lng are required" }, { status: 400 });
  }
  const left = stores(input.left);
  const right = stores(input.right);
  const street = String(input.street ?? "").slice(0, 80);
  const [from, to] = Array.isArray(input.between) ? input.between : [null, null];
  const where = `${street}${from && to ? ` between ${from} and ${to}` : ""} in Manhattan, New York`;
  const ai = new GoogleGenAI({ apiKey });

  try {
    let found: { store: Store; side: ExplorePlace["side"]; address: string | null } | null =
      byName(query, left, right);
    found ??= await pickOnBlock(ai, query, where, left, right);
    found ??= await findNearby(ai, query, where, input.lat, input.lng);
    if (!found) {
      return NextResponse.json(
        { error: `Couldn't find a business matching "${query}" near you.` },
        { status: 404 },
      );
    }
    const website = await findWebsite(ai, found.store.name, found.address ?? where);
    const url = website ?? found.store.uri;
    if (!url) {
      return NextResponse.json(
        { error: `Found ${found.store.name}, but not a page to open for it.` },
        { status: 404 },
      );
    }
    const place: ExplorePlace = {
      name: found.store.name,
      address: found.address,
      side: found.side,
      url,
      embeddable: await checkEmbeddable(url),
      mapsUri: found.store.uri,
    };
    return NextResponse.json(place, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: `Lookup failed: ${message}` }, { status: 502 });
  }
}

// 1. A storefront on this block named in the query.
function byName(query: string, left: Store[], right: Store[]) {
  const l = match(query, left);
  if (l) return { store: l, side: "left" as const, address: null };
  const r = match(query, right);
  if (r) return { store: r, side: "right" as const, address: null };
  return null;
}

// 2. The block's storefront that fits a description, judged by Gemini.
async function pickOnBlock(
  ai: GoogleGenAI,
  query: string,
  where: string,
  left: Store[],
  right: Store[],
) {
  if (left.length + right.length === 0) return null;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Someone walking along ${where} wants to explore "${query}". Storefronts on their left: ${JSON.stringify(left.map((s) => s.name))}. On their right: ${JSON.stringify(right.map((s) => s.name))}. Which one do they mean? Give its exact name from the lists, or null if none of them fits.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING, nullable: true } },
        required: ["name"],
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const name = (JSON.parse(response.text ?? "{}") as { name?: string | null }).name;
  return name ? byName(name, left, right) : null;
}

// 3. The closest matching business, from Google Maps.
async function findNearby(ai: GoogleGenAI, query: string, where: string, lat: number, lng: number) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Someone walking along ${where} wants to explore "${query}". Find the closest real business on Google Maps that matches. Answer as two lines exactly:
NAME: <business name>
ADDRESS: <street address>`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const places: Store[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.maps)
    .filter((maps) => maps?.title)
    .map((maps) => ({
      name: maps!.title!.replace(/ - Google Maps$/, "").trim(),
      uri: maps!.uri ?? null,
    }));
  const text = response.text ?? "";
  const store = match(field(text, "NAME"), places);
  return store ? { store, side: null, address: field(text, "ADDRESS") || null } : null;
}

// 4. The business's own website, from Google Search, if it exists. Search
// answers vary run to run, so a miss is asked once more.
async function findWebsite(ai: GoogleGenAI, name: string, where: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = await searchWebsite(ai, name, where);
    if (url && (await exists(url))) return url;
  }
  return null;
}

async function searchWebsite(ai: GoogleGenAI, name: string, where: string): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `What is the official website of ${name} (${where})? Its own site, not Google Maps, Yelp, delivery apps or social media. Reply with just the URL, or NONE.`,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return /https?:\/\/[^\s<>"')\]]+/i.exec(response.text ?? "")?.[0]?.replace(/[.,;]+$/, "") ?? null;
}

function field(text: string, label: string): string {
  return (
    new RegExp(`^\\W*${label}\\W*:\\s*(.+)$`, "im").exec(text)?.[1].replace(/\*+/g, "").trim() ??
    ""
  );
}

function stores(value: unknown): Store[] {
  return Array.isArray(value)
    ? value
        .filter((s): s is Store => typeof s?.name === "string")
        .slice(0, 12)
        .map((s) => ({ name: s.name.slice(0, 120), uri: typeof s.uri === "string" ? s.uri : null }))
    : [];
}

/** The listed store a name refers to. */
function match(name: string, list: Store[]): Store | null {
  const key = normalize(name.replace(/^(?:the|a|an|that|this)\s+/i, ""));
  if (key.length < 3) return null;
  return (
    list.find((s) => {
      const other = normalize(s.name);
      return other === key || other.includes(key) || key.includes(other);
    }) ?? null
  );
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Whether the page is really there. Sites that turn away servers (403, 429)
// still exist and may load fine in the browser; 404s and dead hosts don't.
async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html,*/*;q=0.8",
      },
    });
    void res.body?.cancel().catch(() => {});
    return res.ok || [401, 403, 405, 429].includes(res.status);
  } catch {
    return false;
  }
}
