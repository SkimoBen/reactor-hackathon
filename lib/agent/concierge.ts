// The Concierge turns what the user does in the world into something real.
//
// Given what they just said, the current frame, and the recent log, it works
// out where the character is (a pizza parlor, a gelato café…) and whether the
// utterance is a real-world intent (order, book, buy). If so it web-searches
// for the matching real business near the user's address and hands back the
// best ordering URL for the overlay. It can also return one scene instruction
// so the world plays along ("you step up to the counter").
//
// The overlay is an <iframe>, and most ordering sites refuse to be framed, so
// the URL is probed for X-Frame-Options / CSP frame-ancestors here, server
// side — the browser can't tell a blocked frame from a slow one.

import { USER_LOCATION } from "./config";
import {
  AGENT_MODEL,
  getOpenAI,
  imageInput,
  jsonSchemaFormat,
  parseDecision,
  webSearchTool,
} from "./openai";

export interface ConciergeInput {
  /** JPEG data URL of the current frame, or null when nothing is streaming. */
  screenshot: string | null;
  utterance: string;
  place: string;
  worldPrompt: string | null;
  chapters: string[];
  events: string[];
}

export interface ConciergeDecision {
  action: "none" | "open_overlay";
  reasoning: string;
  shop: { name: string; address: string; url: string } | null;
  overlay_url: string | null;
  world_instruction: string | null;
}

export interface ConciergeOutput extends ConciergeDecision {
  /** Whether overlay_url will load inside an <iframe> on this app. */
  embeddable: boolean;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "reasoning", "shop", "overlay_url", "world_instruction"],
  properties: {
    action: { type: "string", enum: ["none", "open_overlay"] },
    reasoning: {
      type: "string",
      description:
        "One or two sentences of plain text (no markdown, no URLs): where the character is, what the user wants, and why this shop (or why no action).",
    },
    shop: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["name", "address", "url"],
          properties: {
            name: { type: "string" },
            address: { type: "string" },
            url: { type: "string", description: "The business's main website." },
          },
        },
        { type: "null" },
      ],
    },
    overlay_url: {
      type: ["string", "null"],
      description:
        "The page to open for the user to complete the intent: the business's own online-ordering page if it has one, otherwise its Slice / DoorDash / Seamless / OpenTable listing. Must be a full https URL from your search results.",
    },
    world_instruction: {
      type: ["string", "null"],
      description:
        "Optional: one scene direction (≤20 words) so the video plays along, e.g. 'You step up to the counter and the pizzaiolo looks up.'",
    },
  },
};

const SYSTEM = `You are the Concierge for a live, AI-generated walking video of a real place: {place}. The user explores it and sometimes says things. Your job is to notice when what they say is a real-world intent — ordering food, booking a table, buying something — and connect it to a real business they could actually use.

The user's real address is {address}. Treat "near me" as near that address.

Procedure:
1. From the frame and the recent log, decide what kind of business the character is in or standing outside (pizza shop, gelato café, coffee bar, bookstore…). The world is generated, so signage may be garbled; go by the type of place.
2. Decide whether the utterance is an actionable intent. Small talk, questions about the scene, and directions to the world ("turn left") are NOT intents → action: "none", overlay_url: null, shop: null.
3. If it is an intent, use web search to find the real business of that type closest to the address that best matches what's on screen, and its ordering URL. Prefer the business's own online-ordering page; otherwise its Slice, DoorDash, Seamless, or OpenTable listing. Only return URLs you found in search results — never invent one.
4. Return action: "open_overlay" with the shop and overlay_url. You may also return a short world_instruction so the video plays along with the intent.

Be decisive: when the user clearly wants to order and the frame shows any food business, pick the best real match and open it.`;

export async function runConcierge(input: ConciergeInput): Promise<ConciergeOutput> {
  const client = getOpenAI();
  const context = [
    `The user just said: "${input.utterance}"`,
    input.worldPrompt ? `World prompt:\n${input.worldPrompt}` : null,
    input.chapters.length
      ? `Chapters so far:\n${input.chapters.map((c) => `- ${c}`).join("\n")}`
      : null,
    input.events.length
      ? `Recent log:\n${input.events.join("\n")}`
      : "Recent log: (empty)",
    input.screenshot
      ? "Here is the current frame."
      : "No video is streaming right now, so there is no frame; decide from the text alone.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.responses.create({
    model: AGENT_MODEL,
    instructions: SYSTEM.replace("{place}", input.place).replace(
      "{address}",
      USER_LOCATION.address,
    ),
    tools: [webSearchTool()],
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: context },
          ...(input.screenshot ? [imageInput(input.screenshot)] : []),
        ],
      },
    ],
    text: { format: jsonSchemaFormat("concierge_decision", SCHEMA) },
  });

  const decision = parseDecision<ConciergeDecision>(
    response.output_text,
    "Concierge",
  );
  const overlayUrl = sanitizeUrl(decision.overlay_url);
  const open = decision.action === "open_overlay" && overlayUrl !== null;
  return {
    ...decision,
    action: open ? "open_overlay" : "none",
    overlay_url: open ? overlayUrl : null,
    world_instruction: decision.world_instruction?.trim() || null,
    embeddable: open ? await checkEmbeddable(overlayUrl) : false,
  };
}

function sanitizeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Will this page load inside our <iframe>? Sites opt out with X-Frame-Options
 * or a CSP frame-ancestors directive; anything we can't fetch counts as no. */
export async function checkEmbeddable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html,*/*;q=0.8",
      },
    });
    // Drop the body; only the headers matter.
    void res.body?.cancel().catch(() => {});
    if (!res.ok) return false;
    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
    const csp = res.headers.get("content-security-policy") ?? "";
    const frameAncestors = /frame-ancestors\s+([^;]+)/i.exec(csp)?.[1];
    // Any allowlist that isn't "*" won't include localhost, so it's a no.
    if (frameAncestors && !frameAncestors.trim().split(/\s+/).includes("*"))
      return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
