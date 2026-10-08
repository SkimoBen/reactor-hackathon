// The Shopper: once the Concierge has opened a store for something the user
// wants to buy ("the blue shirt"), a browser agent shops for it for real.
//
// It runs in an OpenAI-hosted browser (Agents API computer use): we create a
// session, send it the store URL, what to look for, and the frame from the
// world showing the item, then follow the session's events. Each browser step
// arrives as a computer_use_call item with a screenshot, which is relayed to
// the overlay so the user watches it shop.
//
// The hosted browser's cookies never reach the user, so its cart can't be
// handed over as is. The agent adds the item to the cart and stops before
// checkout, then returns a link that rebuilds the cart in any browser (a
// Shopify cart permalink) or, failing that, the product page. Headless
// Shopify stores 404 on permalinks, so the link is checked here before the
// user gets it.
//
// Every new website origin needs approval. The store's own site (and the
// Shopify domains a store's cart can hop to) is approved automatically;
// anything else is denied, and sign-in requests are always cancelled.

import type OpenAI from "openai";
import { AGENT_BROWSER_MODEL, getOpenAI } from "./openai";

export interface ShopperInput {
  /** The store page the Concierge opened. */
  url: string;
  /** What to find, as the Concierge described it from the frame. */
  task: string;
  /** JPEG data URL of the frame showing the item, if one was captured. */
  screenshot: string | null;
}

export interface ShopperResult {
  status: "added_to_cart" | "found" | "not_found";
  product_name: string | null;
  price: string | null;
  product_url: string | null;
  /** A link that rebuilds the cart in the user's own browser, when the store
   * supports one. */
  cart_url: string | null;
  summary: string;
}

/** What the route streams to the browser, one JSON object per line. */
export type ShopperMessage =
  | { type: "started"; sessionId: string }
  | { type: "step"; title: string; image: string | null }
  /** The agent narrating progress ("Found a navy tee for $62…"). */
  | { type: "note"; text: string }
  | { type: "origin"; origin: string; approved: boolean }
  | { type: "done"; result: ShopperResult }
  | { type: "error"; message: string };

const INSTRUCTIONS = `You are a personal shopper working in a web browser for a user who is watching your screen. They saw an item in a video and want to buy something like it from a specific store.

1. Open the store URL you are given. Dismiss cookie banners and pop-ups by declining or closing them.
2. Use the store's search or menus to find the product that best matches the description and the attached image: same kind of item, colour, and style first, then details (fit, neckline, material). A close match is fine; the exact item rarely exists.
3. Open its product page. If a size or variant is required, pick size M (or the middle option) unless the description says otherwise. Add one to the cart.
4. Stop there. Never go to checkout, never sign in or create an account, never enter any personal, address, or payment details.
5. Your browser's cart won't carry over to the user's browser, so work out a link that rebuilds it: on a Shopify store (URLs like /products/<handle>, or "Shopify" in the page source) find the variant id (the ?variant= parameter on the product page, or the "variants" in /products/<handle>.js) and use https://<store host>/cart/<variant id>:1. If the store has no such link, leave cart_url null.

Work quickly: prefer the search box over browsing categories, and don't compare more than a handful of products. The user only sees your screenshots, so after each page load or click, look at the screen to confirm what happened rather than reading the page source.

Your final message must be only a JSON object, no prose or code fence:
{"status": "added_to_cart" | "found" | "not_found", "product_name": string | null, "price": string | null, "product_url": string | null, "cart_url": string | null, "summary": "one short sentence for the user about what you found and added, without links"}`;

/** Origins approved without asking besides the store's own site: where
 * Shopify stores send their cart and checkout. */
const ALWAYS_APPROVED = ["myshopify.com", "shopify.com", "shop.app"];

type Emit = (message: ShopperMessage) => void;

export async function runShopper(
  input: ShopperInput,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  const client = getOpenAI();
  const storeSite = siteOf(new URL(input.url).hostname);

  const session = await client.beta.agents.sessions.create({
    agent: {
      model: AGENT_BROWSER_MODEL,
      instructions: INSTRUCTIONS,
      tools: [{ type: "computer_use", include_screenshots: true }],
    },
    environment: {
      type: "openai_hosted",
      desktop: { enabled: true },
      network: { access: "enabled" },
    },
  });
  emit({ type: "started", sessionId: session.id });

  let finished = false;
  let events: Awaited<ReturnType<typeof client.beta.agents.sessions.events.stream>> | null =
    null;
  // The user closed the overlay: stop the browser rather than let it shop on.
  const onAbort = () => events?.controller.abort();
  signal.addEventListener("abort", onAbort);
  try {
    // Closed while the session was being created.
    if (signal.aborted) return;
    events = await client.beta.agents.sessions.events.stream(session.id);
    if (signal.aborted) return;
    await client.beta.agents.sessions.events.create(session.id, {
      events: [
        {
          type: "agent.session.input.message",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Store: ${input.url}\nFind: ${input.task}${
                    input.screenshot ? "\nThe attached frame shows the item." : ""
                  }`,
                },
                ...(input.screenshot
                  ? [{ type: "input_image" as const, image_url: input.screenshot }]
                  : []),
              ],
            },
          ],
        },
      ],
    });

    const handled = new Set<string>();
    let finalText = "";
    for await (const event of events) {
      switch (event.type) {
        case "agent.session.requires_action": {
          const current = await client.beta.agents.sessions.retrieve(session.id);
          for (const action of current.required_actions) {
            if (
              action.type !== "computer_use_approval_request" ||
              handled.has(action.request_id)
            )
              continue;
            handled.add(action.request_id);
            await answerApproval(client, session.id, action, storeSite, emit);
          }
          break;
        }
        case "agent.session.turn.item.done": {
          const item = event.item;
          if (item.type !== "computer_use_call") break;
          emit({
            type: "step",
            title: item.title ?? "Browsing",
            image:
              item.output?.type === "computer_screenshot" ? item.output.image_url : null,
          });
          break;
        }
        case "agent.session.turn.output_text.done":
          // Progress notes along the way; the last message is the JSON result.
          finalText = event.text;
          if (!finalText.trim().startsWith("{"))
            emit({ type: "note", text: finalText.trim() });
          break;
        case "error":
          throw new Error(event.error.message);
        case "agent.session.failed":
        case "agent.session.environment.failed":
          throw new Error(`The browser session failed (${event.type})`);
        case "agent.session.turn.failed":
          if (event.turn.subagent_id === null)
            throw new Error(event.turn.error?.message ?? "The browser task failed");
          break;
        case "agent.session.turn.cancelled":
          if (event.turn.subagent_id === null)
            throw new Error("The browser task was cancelled");
          break;
        case "agent.session.turn.completed":
          if (event.turn.subagent_id === null) finished = true;
          break;
      }
      if (finished) break;
    }
    if (signal.aborted) return;
    if (!finished) throw new Error("The browser stream closed before the task finished");
    const result = parseResult(finalText, input.url);
    if (result.cart_url && !(await opens(result.cart_url))) result.cart_url = null;
    emit({ type: "done", result });
  } finally {
    signal.removeEventListener("abort", onAbort);
    events?.controller.abort();
    if (!finished) {
      await client.beta.agents.sessions.events
        .create(session.id, { events: [{ type: "agent.session.input.cancel" }] })
        .catch(() => {});
    }
    await client.beta.agents.sessions.delete(session.id).catch(() => {});
  }
}

type ApprovalRequest = Extract<
  OpenAI.Beta.Agents.AgentSession["required_actions"][number],
  { type: "computer_use_approval_request" }
>;

async function answerApproval(
  client: OpenAI,
  sessionId: string,
  action: ApprovalRequest,
  storeSite: string,
  emit: Emit,
) {
  const request = action.request;
  let response;
  if (request.type === "browser_origin_access") {
    const approved = isApprovedOrigin(request.origin, storeSite);
    emit({ type: "origin", origin: request.origin, approved });
    response = {
      type: "browser_origin_access" as const,
      decision: approved ? ("approve" as const) : ("deny" as const),
    };
  } else {
    // The task never signs in.
    response = { type: "browser_authentication" as const, action: "cancel" as const };
  }
  await client.beta.agents.sessions.events.create(
    sessionId,
    {
      events: [
        {
          type: "agent.session.input.computer_use_approval_request_result",
          request_id: action.request_id,
          response,
        },
      ],
    },
    { maxRetries: 0 },
  );
}

function isApprovedOrigin(origin: string, storeSite: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const site = siteOf(url.hostname);
    return site === storeSite || ALWAYS_APPROVED.includes(site);
  } catch {
    return false;
  }
}

/** The host's last two labels: shop.example.com and www.example.com are both
 * example.com. Crude (it treats example.co.uk as co.uk), but the store's own
 * subdomains are all it needs to match. */
function siteOf(hostname: string): string {
  return hostname.toLowerCase().split(".").slice(-2).join(".");
}

/** Does this link lead somewhere in a fresh browser? A redirect counts: a
 * Shopify permalink redirects to the cart or checkout. */
async function opens(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      },
    });
    void res.body?.cancel().catch(() => {});
    return res.status < 400;
  } catch {
    return false;
  }
}

function parseResult(text: string, storeUrl: string): ShopperResult {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  let raw: Partial<ShopperResult> = {};
  try {
    if (json) raw = JSON.parse(json) as Partial<ShopperResult>;
  } catch {
    // Fall through to the summary-only result.
  }
  const status =
    raw.status === "added_to_cart" || raw.status === "found" ? raw.status : "not_found";
  return {
    status,
    product_name: str(raw.product_name),
    price: str(raw.price),
    product_url: httpUrl(raw.product_url),
    cart_url: httpUrl(raw.cart_url),
    summary:
      str(raw.summary) ??
      (text.trim().slice(0, 300) || `Couldn't find a match on ${new URL(storeUrl).hostname}.`),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
