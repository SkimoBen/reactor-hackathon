// Server-only OpenAI plumbing shared by the agents. Never import from the
// browser: it reads OPEN_AI_KEY.
//
// Both agents use the Responses API: image input for the frame, the hosted
// web_search tool (with the user's location) when the Concierge needs the
// real world, and a strict JSON schema for the decision so the client can
// act on it without parsing prose.

import OpenAI from "openai";
import type {
  ResponseInputImage,
  Tool,
} from "openai/resources/responses/responses";
import { USER_LOCATION } from "./config";

/** The Concierge: one call per utterance, needs judgement and web search. */
export const AGENT_MODEL = process.env.AGENT_MODEL ?? "gpt-6.1-sol";
/** The Director: looks at a frame every few seconds, so cheap and quick. */
export const AGENT_FAST_MODEL = process.env.AGENT_FAST_MODEL ?? "gpt-6-luna";

export class AgentConfigError extends Error {}

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPEN_AI_KEY;
  if (!apiKey) {
    throw new AgentConfigError(
      "OPEN_AI_KEY is not set on the server — add it to .env.local",
    );
  }
  return new OpenAI({ apiKey });
}

export function webSearchTool(): Tool {
  return {
    type: "web_search",
    search_context_size: "medium",
    user_location: {
      type: "approximate",
      country: USER_LOCATION.country,
      city: USER_LOCATION.city,
      region: USER_LOCATION.region,
      timezone: USER_LOCATION.timezone,
    },
  };
}

export function imageInput(dataUrl: string): ResponseInputImage {
  return { type: "input_image", image_url: dataUrl, detail: "low" };
}

export function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
  return { type: "json_schema" as const, name, schema, strict: true };
}

/** The model's structured reply, or a clear error naming what came back. */
export function parseDecision<T>(outputText: string, what: string): T {
  try {
    return JSON.parse(outputText) as T;
  } catch {
    throw new Error(`${what} returned non-JSON output: ${outputText.slice(0, 200)}`);
  }
}
