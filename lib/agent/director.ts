// The Director keeps the generated world looking like the real place.
//
// It is called on a timer with the current frame and decides whether to send
// one short scene instruction through HappyOyster's `instruct()` — the only
// live steering channel a Directing world has (images are creation-time
// only). Most ticks it should say nothing: a drifting world settles worse
// when it's nudged every few seconds, and every instruction lands in the
// story timeline the user sees. It names the kind of drift it saw (issue) and
// is told how long ago the last instruction went out, so it lets one land
// before sending another. Instructions follow Alibaba's HappyOyster guide:
// short, concrete, one change, present tense (lib/agent/prompts.ts).

import {
  AGENT_FAST_MODEL,
  getOpenAI,
  imageInput,
  jsonSchemaFormat,
  parseDecision,
  toolCallsOf,
  usageOf,
} from "./openai";
import { DIRECTOR_SYSTEM } from "./prompts";
import type {
  AgentTrace,
  DirectorOverrides,
  RecentInstruction,
} from "./protocol";

export interface DirectorInput {
  /** JPEG data URL of the current frame. */
  screenshot: string;
  place: string;
  worldPrompt: string | null;
  /** Chapter briefs HappyOyster has reported for the travel so far. */
  chapters: string[];
  /** The recent action log, one line each (lib/agent/events.ts). */
  events: string[];
  /** The newest instruction sent to the world, from any source. */
  lastInstruction: RecentInstruction | null;
  settings?: DirectorOverrides;
}

export const DIRECTOR_ISSUES = [
  "none",
  "camera",
  "stalled",
  "off_place",
  "weather_light",
  "unwanted_event",
] as const;

export interface DirectorOutput {
  observation: string;
  issue: (typeof DIRECTOR_ISSUES)[number];
  instruction: string | null;
  trace: AgentTrace;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation", "issue", "instruction"],
  properties: {
    observation: {
      type: "string",
      description:
        "One sentence: what the frame shows and whether it still reads as the real place.",
    },
    issue: {
      type: "string",
      enum: DIRECTOR_ISSUES,
      description: "The one kind of drift the frame shows, or none.",
    },
    instruction: {
      type: ["string", "null"],
      description:
        "One present-tense sentence of at most 15 words describing what happens next on screen, or null.",
    },
  },
};

export async function runDirector(input: DirectorInput): Promise<DirectorOutput> {
  const client = getOpenAI();
  const context = [
    input.worldPrompt ? `World prompt:\n${input.worldPrompt}` : null,
    input.lastInstruction
      ? `Last instruction to the world: ${input.lastInstruction.secondsAgo}s ago, from ${input.lastInstruction.source}: "${input.lastInstruction.text}"`
      : "Last instruction to the world: none yet.",
    input.chapters.length
      ? `Chapters so far:\n${input.chapters.map((c) => `- ${c}`).join("\n")}`
      : null,
    input.events.length
      ? `Recent log:\n${input.events.join("\n")}`
      : "Recent log: (empty)",
    "Here is the current frame.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const settings = input.settings ?? {};
  const model = settings.model ?? AGENT_FAST_MODEL;
  const instructions = (settings.systemPrompt ?? DIRECTOR_SYSTEM).replaceAll(
    "{place}",
    input.place,
  );
  const imageDetail = settings.imageDetail ?? "low";

  const response = await client.responses.create({
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: context },
          imageInput(input.screenshot, imageDetail),
        ],
      },
    ],
    text: { format: jsonSchemaFormat("director_decision", SCHEMA) },
  });

  const decision = parseDecision<Omit<DirectorOutput, "trace">>(
    response.output_text,
    "Director",
  );
  return {
    observation: decision.observation,
    issue: decision.issue,
    instruction: decision.instruction?.trim() || null,
    trace: {
      model,
      instructions,
      input: context,
      imageDetail,
      tools: [],
      toolCalls: toolCallsOf(response),
      output: response.output_text,
      usage: usageOf(response),
    },
  };
}
