import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { StorefrontLabel } from "@/lib/walk/types";

// POST { screenshot, left, right } → { storefronts: [{ name, side, box }] }
//
// Gemini vision finds the storefronts in the current frame and labels each
// with one of the real stores on this stretch of Broadway (left = the west
// side walking north, right = the east side; see /api/walk/stores). The world
// is generated, so this is the most plausible assignment, not recognition:
// names can only come from the lists given, and anything else is dropped.
// `box` is [ymin, xmin, ymax, xmax] on the frame, normalised to 0–1000.

const MODEL = process.env.WALK_MODEL || "gemini-3.7-flash";
const MAX_STOREFRONTS = 5;
const MAX_NAMES = 12;
const MAX_IMAGE_CHARS = 2_000_000;

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    storefronts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          side: { type: Type.STRING, enum: ["left", "right"] },
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ["name", "side", "box_2d"],
      },
    },
  },
  required: ["storefronts"],
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }
  let body: { screenshot?: unknown; left?: unknown; right?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(
    typeof body.screenshot === "string" && body.screenshot.length < MAX_IMAGE_CHARS
      ? body.screenshot
      : "",
  );
  const left = names(body.left);
  const right = names(body.right);
  if (!match) {
    return NextResponse.json(
      { error: "screenshot must be a JPEG data URL" },
      { status: 400 },
    );
  }
  if (left.length + right.length === 0) return NextResponse.json({ storefronts: [] });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: match[1] } },
            {
              text: `Street-level frame, camera walking north up Broadway in Manhattan. Find up to ${MAX_STOREFRONTS} clearly visible storefronts (shop facades or entrances at street level). Label each with the most plausible name from these real stores: left side of the street = ${JSON.stringify(left)}; right side = ${JSON.stringify(right)}. Nearer storefronts are larger and closer to the frame edge; they come first in each list. Use each name at most once, and skip storefronts you can't place. box_2d is [ymin, xmin, ymax, xmax] normalized to 0-1000.`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    });
    const parsed = JSON.parse(response.text ?? "{}") as {
      storefronts?: { name?: string; side?: string; box_2d?: number[] }[];
    };
    const allowed = { left: new Set(left), right: new Set(right) };
    const used = new Set<string>();
    const storefronts: StorefrontLabel[] = [];
    for (const item of parsed.storefronts ?? []) {
      const side = item.side === "right" ? "right" : "left";
      const box = item.box_2d;
      if (
        !item.name ||
        !allowed[side].has(item.name) ||
        used.has(item.name) ||
        !Array.isArray(box) ||
        box.length !== 4 ||
        !box.every((v) => Number.isFinite(v) && v >= 0 && v <= 1000) ||
        box[0] >= box[2] ||
        box[1] >= box[3]
      ) {
        continue;
      }
      used.add(item.name);
      storefronts.push({
        name: item.name,
        side,
        box: box as StorefrontLabel["box"],
      });
    }
    return NextResponse.json({
      storefronts: storefronts.slice(0, MAX_STOREFRONTS),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      { error: `Storefront labelling failed: ${message}` },
      { status: 502 },
    );
  }
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((name) => String(name).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, MAX_NAMES)
    : [];
}
