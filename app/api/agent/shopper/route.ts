import { NextResponse } from "next/server";
import { runShopper, type ShopperInput, type ShopperMessage } from "@/lib/agent/shopper";

// POST a store URL + what to buy + the frame showing it → a stream of the
// hosted browser's steps (one JSON ShopperMessage per line), ending in "done"
// with the product and cart link, or "error". Aborting the request (the user
// closed the overlay) cancels the browser session.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: Partial<ShopperInput>;
  try {
    body = (await request.json()) as Partial<ShopperInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (typeof body.task !== "string" || !body.task.trim()) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }
  const input: ShopperInput = {
    url: body.url,
    task: body.task.trim(),
    screenshot:
      typeof body.screenshot === "string" && body.screenshot.startsWith("data:image/")
        ? body.screenshot
        : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (message: ShopperMessage) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      };
      try {
        await runShopper(input, emit, request.signal);
      } catch (cause) {
        emit({
          type: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
