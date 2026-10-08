import { NextResponse } from "next/server";
import { runDirector, type DirectorInput } from "@/lib/agent/director";
import { AgentConfigError } from "@/lib/agent/openai";
import {
  readDirectorOverrides,
  readRecentInstruction,
} from "@/lib/agent/protocol";

// POST one frame + context → the Director's observation and optional
// instruction. Same error shape as the token route: { error } with 500 for
// missing server config, 502 when the model call fails.
export async function POST(request: Request) {
  let body: Partial<DirectorInput>;
  try {
    body = (await request.json()) as Partial<DirectorInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.screenshot !== "string" || typeof body.place !== "string") {
    return NextResponse.json(
      { error: "screenshot and place are required" },
      { status: 400 },
    );
  }
  try {
    const result = await runDirector({
      screenshot: body.screenshot,
      place: body.place,
      worldPrompt: body.worldPrompt ?? null,
      chapters: body.chapters ?? [],
      events: body.events ?? [],
      lastInstruction: readRecentInstruction(body.lastInstruction),
      settings: readDirectorOverrides(body.settings),
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
