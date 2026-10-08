// The Watcher holds a Concierge overlay back until the video catches up.
//
// HappyOyster renders an instruction seconds after it's sent, so when the user
// says "pick up the blue shirt and buy it at the till", the shop's page should
// open once the character is actually at the till, not the moment the words
// are heard. The Concierge names that moment (open_when); the browser then
// sends a frame every few seconds and this asks the fast model one question:
// does this frame show it yet?

import {
  AGENT_FAST_MODEL,
  getOpenAI,
  imageInput,
  jsonSchemaFormat,
  parseDecision,
  toolCallsOf,
  usageOf,
} from "./openai";
import type { AgentTrace } from "./protocol";

export interface WatcherInput {
  /** JPEG data URL of the current frame. */
  screenshot: string;
  /** What the user said that started the wait. */
  utterance: string;
  /** The moment to wait for, as the Concierge wrote it. */
  condition: string;
  secondsWaiting: number;
}

export interface WatcherOutput {
  observation: string;
  met: boolean;
  trace: AgentTrace;
}

const INSTRUCTIONS = `You watch a live, AI-generated walking video for one moment. The user asked for something (ordering, buying, booking) and the world model is acting it out; a real shop's page will open for them once the video shows the moment described below. The world model lags: instructions take several seconds to render, and the character usually has to walk somewhere first.

Judge only the frame you are given:
- met: true when the frame shows the moment, or clearly shows it has already happened (e.g. paying at the counter, or walking off with the shopping bag). The video is generated, so props and signage may be imperfect — judge the situation, not exact details.
- met: false while the character is still on the way, still browsing, or the scene shows something else.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation", "met"],
  properties: {
    observation: {
      type: "string",
      description: "One short sentence: what the character is doing in this frame.",
    },
    met: { type: "boolean" },
  },
};

export async function runWatcher(input: WatcherInput): Promise<WatcherOutput> {
  const client = getOpenAI();
  const context = [
    `The user said: "${input.utterance}"`,
    `Wait for: ${input.condition}`,
    `Waiting for ${input.secondsWaiting}s so far.`,
    "Here is the current frame.",
  ].join("\n\n");
  const model = AGENT_FAST_MODEL;

  const response = await client.responses.create({
    model,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: context },
          imageInput(input.screenshot, "low"),
        ],
      },
    ],
    text: { format: jsonSchemaFormat("watcher_decision", SCHEMA) },
  });

  const decision = parseDecision<Omit<WatcherOutput, "trace">>(
    response.output_text,
    "Watcher",
  );
  return {
    observation: decision.observation,
    met: decision.met === true,
    trace: {
      model,
      instructions: INSTRUCTIONS,
      input: context,
      imageDetail: "low",
      tools: [],
      toolCalls: toolCallsOf(response),
      output: response.output_text,
      usage: usageOf(response),
    },
  };
}
