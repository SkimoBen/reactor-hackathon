// Server-only OpenAI plumbing shared by the agents. Never import from the
// browser: it reads OPEN_AI_KEY.
//
// Both agents use the Responses API: image input for the frame, the hosted
// web_search tool (with the user's location) when the Concierge needs the
// real world, and a strict JSON schema for the decision so the client can
// act on it without parsing prose.

import OpenAI from "openai";
import type {
  Response,
  ResponseInputImage,
  Tool,
} from "openai/resources/responses/responses";
import { USER_LOCATION } from "./config";
import type { ImageDetail, SearchContextSize, TraceToolCall } from "./protocol";

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

export function webSearchTool(contextSize: SearchContextSize = "medium"): Tool {
  return {
    type: "web_search",
    search_context_size: contextSize,
    user_location: {
      type: "approximate",
      country: USER_LOCATION.country,
      city: USER_LOCATION.city,
      region: USER_LOCATION.region,
      timezone: USER_LOCATION.timezone,
    },
  };
}

export function imageInput(
  dataUrl: string,
  detail: ImageDetail = "low",
): ResponseInputImage {
  return { type: "input_image", image_url: dataUrl, detail };
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

/** The tool calls a response made, flattened for the debug panel. */
export function toolCallsOf(response: Response): TraceToolCall[] {
  const calls: TraceToolCall[] = [];
  for (const item of response.output) {
    if (item.type === "message" || item.type === "reasoning") continue;
    if (item.type === "web_search_call") {
      const action = item.action;
      if (action.type === "search") {
        calls.push({
          type: "search",
          queries: action.queries ?? (action.query ? [action.query] : []),
          sources: (action.sources ?? []).map((source) => source.url),
          status: item.status,
        });
      } else if (action.type === "open_page") {
        calls.push({ type: "open_page", url: action.url ?? null, status: item.status });
      } else {
        calls.push({
          type: "find_in_page",
          pattern: action.pattern,
          url: action.url,
          status: item.status,
        });
      }
      continue;
    }
    const { type, ...rest } = item as { type: string; status?: string };
    calls.push({
      type: "other",
      name: type,
      detail: JSON.stringify(rest).slice(0, 2000),
      status: rest.status ?? "",
    });
  }
  return calls;
}

export function usageOf(response: Response) {
  return response.usage
    ? { input: response.usage.input_tokens, output: response.usage.output_tokens }
    : null;
}
