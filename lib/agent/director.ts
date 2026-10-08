// The Director keeps the generated world looking like the real place.
//
// It is called on a timer with the current frame and decides whether to send
// one short scene instruction through HappyOyster's `instruct()` — the only
// live steering channel a Directing world has (images are creation-time
// only). Most ticks it should say nothing: a drifting world settles worse
// when it's nudged every few seconds, and every instruction lands in the
// story timeline the user sees.

import {
  AGENT_FAST_MODEL,
  getOpenAI,
  imageInput,
  jsonSchemaFormat,
  parseDecision,
} from "./openai";

export interface DirectorInput {
  /** JPEG data URL of the current frame. */
  screenshot: string;
  place: string;
  worldPrompt: string | null;
  /** Chapter briefs HappyOyster has reported for the travel so far. */
  chapters: string[];
  /** The recent action log, one line each (lib/agent/events.ts). */
  events: string[];
}

export interface DirectorOutput {
  observation: string;
  instruction: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation", "instruction"],
  properties: {
    observation: {
      type: "string",
      description:
        "One sentence: what the frame shows and whether it still reads as the real place.",
    },
    instruction: {
      type: ["string", "null"],
      description:
        "A scene direction of at most 25 words to send to the world model, or null when the scene is fine.",
    },
  },
};

const SYSTEM = `You are the Director of a live, AI-generated walking video. The video is meant to look like a real place: {place}. You receive one frame every few seconds plus the recent log of what the user said and what the world was told.

Your job: keep the world grounded to that real place while the user explores it.
- If the frame still looks like the place (right architecture, street furniture, signage, light, people, or a plausible interior of one of its shops), return instruction: null.
- If it has drifted — fantasy elements, wrong city, impossible geometry, the camera lost the walker, the scene froze — return ONE concrete scene direction of at most 25 words, written as a camera/scene instruction the video model can act on (e.g. "Continue up Broadway past the cast-iron storefronts, the Broadway Plaza Hotel sign ahead."). Name real details of the place.
- Respect what the user asked for: if they walked into a pizza shop, keep them in a plausible New York pizza shop; do not drag them back outside.
- Never repeat an instruction that appears in the recent log. Prefer null when unsure.`;

export async function runDirector(input: DirectorInput): Promise<DirectorOutput> {
  const client = getOpenAI();
  const context = [
    input.worldPrompt ? `World prompt:\n${input.worldPrompt}` : null,
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

  const response = await client.responses.create({
    model: AGENT_FAST_MODEL,
    instructions: SYSTEM.replace("{place}", input.place),
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: context },
          imageInput(input.screenshot),
        ],
      },
    ],
    text: { format: jsonSchemaFormat("director_decision", SCHEMA) },
  });

  const decision = parseDecision<DirectorOutput>(response.output_text, "Director");
  return {
    observation: decision.observation,
    instruction: decision.instruction?.trim() || null,
  };
}
