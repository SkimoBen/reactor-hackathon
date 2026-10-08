import { NextResponse } from "next/server";
import { AgentConfigError } from "@/lib/agent/openai";
import { runWatcher, type WatcherInput } from "@/lib/agent/watcher";

// POST a frame + the moment a pending overlay is waiting for → whether the
// frame shows it yet.
export async function POST(request: Request) {
  let body: Partial<WatcherInput>;
  try {
    body = (await request.json()) as Partial<WatcherInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.screenshot !== "string" || !body.screenshot.startsWith("data:image/")) {
    return NextResponse.json({ error: "screenshot is required" }, { status: 400 });
  }
  if (typeof body.condition !== "string" || !body.condition.trim()) {
    return NextResponse.json({ error: "condition is required" }, { status: 400 });
  }
  try {
    const result = await runWatcher({
      screenshot: body.screenshot,
      utterance: typeof body.utterance === "string" ? body.utterance : "",
      condition: body.condition.trim(),
      secondsWaiting:
        typeof body.secondsWaiting === "number" ? Math.round(body.secondsWaiting) : 0,
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
