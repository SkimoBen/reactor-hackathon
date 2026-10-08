import { NextResponse } from "next/server";
import { AGENT_FAST_MODEL, AGENT_MODEL } from "@/lib/agent/openai";

// GET the models the agents use when the settings panel leaves the field
// blank — they can come from env, so the browser can't know them otherwise.
export function GET() {
  return NextResponse.json(
    { directorModel: AGENT_FAST_MODEL, conciergeModel: AGENT_MODEL },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
