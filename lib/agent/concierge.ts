// The Concierge turns what the user does in the world into something real.
//
// Given what they just said, the current frame, and the recent log, it works
// out where the character is (a pizza parlor, a gelato café…) and whether the
// utterance is a real-world intent (order, book, buy). If so it web-searches
// for the matching real business near the user's address and hands back the
// best ordering URL for the overlay. It can also return one scene instruction
// so the world plays along ("you step up to the counter").
//
// The world model renders that instruction seconds later, so the overlay
// shouldn't open while the user is still speaking. The Concierge names the
// on-screen moment it belongs to (open_when: "he's at the till with the blue
// shirt") and the browser holds the overlay until lib/agent/watcher.ts sees
// that moment in a frame.
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
  toolCallsOf,
  usageOf,
  webSearchTool,
} from "./openai";
import { CONCIERGE_SYSTEM } from "./prompts";
import type {
  AgentTrace,
  ConciergeOverrides,
  LastOverlay,
  PendingOverlay,
} from "./protocol";

export interface ConciergeInput {
  /** JPEG data URL of the current frame, or null when nothing is streaming. */
  screenshot: string | null;
  utterance: string;
  place: string;
  worldPrompt: string | null;
  chapters: string[];
  events: string[];
  /** The overlay this Concierge opened last, if any, and how long ago. */
  lastOverlay?: LastOverlay | null;
  /** An overlay already found and waiting for its moment on screen. */
  pendingOverlay?: PendingOverlay | null;
  settings?: ConciergeOverrides;
}

export interface ConciergeDecision {
  action: "none" | "open_overlay" | "cancel_pending";
  reasoning: string;
  shop: { name: string; address: string; url: string } | null;
  overlay_url: string | null;
  world_instruction: string | null;
  open_when: string | null;
}

export interface ConciergeOutput extends ConciergeDecision {
  /** Whether overlay_url will load inside an <iframe> on this app. */
  embeddable: boolean;
  trace: AgentTrace;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "reasoning",
    "shop",
    "overlay_url",
    "world_instruction",
    "open_when",
  ],
  properties: {
    action: { type: "string", enum: ["none", "open_overlay", "cancel_pending"] },
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
    open_when: {
      type: ["string", "null"],
      description:
        "The moment in the video to wait for before the overlay opens, written so it can be checked in a single frame, e.g. 'the man is at the checkout counter handing over the blue shirt'. null opens it at once — only when the frame already shows that moment, or the user asked to see the page now.",
    },
  },
};

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
    describeLastOverlay(input.lastOverlay ?? null),
    describePendingOverlay(input.pendingOverlay ?? null),
    input.screenshot
      ? "Here is the current frame."
      : "No video is streaming right now, so there is no frame; decide from the text alone.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const settings = input.settings ?? {};
  const model = settings.model ?? AGENT_MODEL;
  const instructions = (settings.systemPrompt ?? CONCIERGE_SYSTEM)
    .replaceAll("{place}", input.place)
    .replaceAll("{address}", USER_LOCATION.address);
  const imageDetail = settings.imageDetail ?? "low";
  const searchContextSize = settings.searchContextSize ?? "medium";
  const webSearch = settings.webSearch ?? true;

  const response = await client.responses.create({
    model,
    instructions,
    tools: webSearch ? [webSearchTool(searchContextSize)] : [],
    // Return the URLs each search drew on, for the debug panel.
    include: webSearch ? ["web_search_call.action.sources"] : undefined,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: context },
          ...(input.screenshot ? [imageInput(input.screenshot, imageDetail)] : []),
        ],
      },
    ],
    text: { format: jsonSchemaFormat("concierge_decision", SCHEMA) },
  });
  const trace: AgentTrace = {
    model,
    instructions,
    input: context,
    imageDetail: input.screenshot ? imageDetail : null,
    tools: webSearch ? [`web_search (context: ${searchContextSize})`] : [],
    toolCalls: toolCallsOf(response),
    output: response.output_text,
    usage: usageOf(response),
  };

  const decision = parseDecision<ConciergeDecision>(
    response.output_text,
    "Concierge",
  );
  const overlayUrl = sanitizeUrl(decision.overlay_url);
  const open = decision.action === "open_overlay" && overlayUrl !== null;
  const cancel = decision.action === "cancel_pending" && !!input.pendingOverlay;
  return {
    ...decision,
    action: open ? "open_overlay" : cancel ? "cancel_pending" : "none",
    overlay_url: open ? overlayUrl : null,
    world_instruction: decision.world_instruction?.trim() || null,
    open_when: open ? decision.open_when?.trim() || null : null,
    embeddable: open ? await checkEmbeddable(overlayUrl) : false,
    trace,
  };
}

// Spelled out in the user message, not only the system prompt, so the repeat
// check still applies when the settings panel swaps in an edited prompt.
function describeLastOverlay(last: LastOverlay | null): string {
  if (!last)
    return "Last overlay: none opened yet this session.";
  const opened = `You last opened "${last.title}" (${last.url}) ${ago(last.openedSecondsAgo)}`;
  const state =
    last.closedSecondsAgo === null
      ? "It is still open."
      : `The user closed it ${ago(last.closedSecondsAgo)}, after it had been open ${
          last.openedSecondsAgo - last.closedSecondsAgo
        }s.`;
  return [
    `Last overlay: ${opened}. ${state}`,
    "Before opening an overlay, compare it with that one. If it would be the same or a similar business (same shop, or same kind of shop for the same need) and it was opened or closed recently (roughly the last few minutes), do NOT open it again unless this utterance explicitly asks for it again (\"open that again\", \"actually, let me order\", \"show me the menu\"). The character still standing at the same counter, or a vague remark about the food, is not a new request — return action \"none\". A clearly different intent or a different kind of business is fine to open.",
  ].join("\n");
}

function describePendingOverlay(pending: PendingOverlay | null): string | null {
  if (!pending) return null;
  return [
    `Pending overlay: you already found "${pending.title}" ${ago(pending.secondsWaiting)} and it opens once the video shows: ${pending.condition}`,
    "Don't search for it again. If the user calls it off (\"never mind\", \"forget it\", \"I don't want it\"), return action \"cancel_pending\". A new intent replaces it.",
  ].join("\n");
}

function ago(seconds: number): string {
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
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
