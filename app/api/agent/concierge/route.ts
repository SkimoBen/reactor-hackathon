import { NextResponse } from "next/server";
import { runConcierge, type ConciergeInput } from "@/lib/agent/concierge";
import { AgentConfigError } from "@/lib/agent/openai";
import { readConciergeOverrides, readLastOverlay } from "@/lib/agent/protocol";

// POST what the user said + the frame + context → the Concierge's decision,
// with the overlay URL already probed for iframe-ability. Web search can take
// a while, so allow the handler a full minute.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: Partial<ConciergeInput>;
  try {
    body = (await request.json()) as Partial<ConciergeInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.utterance !== "string" || !body.utterance.trim()) {
    return NextResponse.json({ error: "utterance is required" }, { status: 400 });
  }
  if (typeof body.place !== "string") {
    return NextResponse.json({ error: "place is required" }, { status: 400 });
  }
  try {
    const result = await runConcierge({
      screenshot: typeof body.screenshot === "string" ? body.screenshot : null,
      utterance: body.utterance.trim(),
      place: body.place,
      worldPrompt: body.worldPrompt ?? null,
      chapters: body.chapters ?? [],
      events: body.events ?? [],
      lastOverlay: readLastOverlay(body.lastOverlay),
      settings: readConciergeOverrides(body.settings),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      { error: message },
      { status: cause instanceof AgentConfigError ? 500 : 502 },
    );
  }
}
