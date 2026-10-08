import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Turn a spoken voice note into a HappyOyster world prompt.
//
// POST { note, mode, current?, maxChars? } → { prompt }
//   note     — the Gemini 3.5 Transcribe transcript of the voice note
//   mode     — "adventure" | "directing", which changes what a good prompt is
//   current  — the composer's existing prompt, if any; the note then revises it
//   maxChars — the composer's budget: the model's cap minus the system prompt
//
// Why rewrite at all?
//   Spoken notes come out short ("a foggy harbor at night"), and short prompts
//   build unstable worlds (see skill/SKILL.md). Good prompts are one dense
//   paragraph of setting, detail, light and mood, so the writer expands the
//   note into that shape. The composer shows the result for editing before
//   anything is built.

const MODEL = process.env.WORLD_PROMPT_MODEL || "gemini-3.7-flash";
const MAX_NOTE_CHARS = 2000;
const MAX_PROMPT_CHARS = 2000; // createWorld's own cap

const SYSTEM_PROMPT = `\
You write world prompts for HappyOyster, a real-time interactive world model.
The user dictated a voice note describing a world; turn it into ONE prompt.

What a good prompt looks like (two real examples):
- "A rain-slicked cyberpunk city street at night. Neon signs in pink, cyan
  and orange reflect in deep puddles on the asphalt, steam rises from grates
  and vents, and holographic billboards flicker above crowded noodle stalls.
  Narrow alleys branch off between towering buildings strung with cables, and
  the wet air glows under the city lights."
- "A slow descent through a luminous underwater canyon. Coral towers in
  violet and teal rise from the seabed, schools of silver fish swirl through
  columns of light from the surface, and a giant manta ray glides past ancient
  shipwreck bones. Bioluminescent plankton sparks in the dark water as the
  camera drifts deeper toward a glowing cave mouth."

Rules:
- One paragraph of at most {targetChars} characters (use most of them),
  present tense, concrete and visual:
  setting, key landmarks and objects, materials and colors, lighting and time
  of day, weather or atmosphere, mood.
- Keep everything the note asks for; add only details that fit it.
{modeRule}
- Describe what is there, never what is absent. No text overlays or UI.
- If a current prompt is given, the note revises it: apply the change and
  keep the rest.

Reply with ONLY this JSON: {"prompt": "..."}`;

const MODE_RULES: Record<string, string> = {
  adventure: `\
- This is an ADVENTURE world the player walks through with WASD: describe an
  open, explorable space with paths, openings and things to approach. No
  camera moves or plot.`,
  directing: `\
- This is a DIRECTING world steered like a film: describe the opening scene,
  who or what it follows, and one camera move ("the camera drifts…").`,
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  let note = "";
  let mode = "adventure";
  let current = "";
  let maxChars = MAX_PROMPT_CHARS;
  try {
    const body = (await request.json()) as {
      note?: string;
      mode?: string;
      current?: string;
      maxChars?: number;
    };
    note = String(body.note ?? "")
      .trim()
      .slice(0, MAX_NOTE_CHARS);
    mode = body.mode === "directing" ? "directing" : "adventure";
    current = String(body.current ?? "")
      .trim()
      .slice(0, MAX_PROMPT_CHARS);
    if (Number.isFinite(body.maxChars)) {
      maxChars = Math.max(1, Math.min(MAX_PROMPT_CHARS, Number(body.maxChars)));
    }
  } catch {
    return NextResponse.json(
      { error: "Malformed request body." },
      { status: 400 },
    );
  }
  if (!note) {
    return NextResponse.json({ error: "The note is empty." }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });
  const generate = (lowThinking: boolean) =>
    ai.models.generateContent({
      model: MODEL,
      contents: `${current ? `Current prompt: ${current}\n\n` : ""}Voice note: "${note}"`,
      config: {
        systemInstruction: SYSTEM_PROMPT.replace(
          "{modeRule}",
          MODE_RULES[mode],
        ).replace("{targetChars}", String(targetChars(maxChars))),
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 2048,
        ...(lowThinking
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });

  let text: string | undefined;
  try {
    try {
      text = (await generate(true)).text;
    } catch {
      // Not every model accepts thinkingLevel; retry with its defaults.
      text = (await generate(false)).text;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `The prompt writer (${MODEL}) failed: ${message}` },
      { status: 502 },
    );
  }

  try {
    const parsed = JSON.parse(text ?? "{}") as { prompt?: string };
    const prompt = String(parsed.prompt ?? "")
      .split(/\s+/)
      .join(" ")
      .trim()
      .slice(0, maxChars);
    if (!prompt) throw new Error("empty prompt");
    return NextResponse.json({ prompt });
  } catch {
    return NextResponse.json(
      { error: "The prompt writer's reply was unusable." },
      { status: 502 },
    );
  }
}

/** 600 like the examples, or less when a long system prompt leaves less
 * room; aim under the budget because the writer's counting is loose. */
function targetChars(maxChars: number): number {
  return Math.max(80, Math.min(600, Math.floor(maxChars * 0.8)));
}
