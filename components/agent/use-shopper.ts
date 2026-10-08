"use client";

// The browser half of the Shopper (lib/agent/shopper.ts): POSTs the store and
// what to find to /api/agent/shopper and folds the streamed steps into one
// view for the overlay — the latest screenshot and step title while it
// shops, then the product and cart link. stop() aborts the request, which
// cancels the hosted browser on the server.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShopperMessage, ShopperResult } from "@/lib/agent/shopper";

export interface ShopperView {
  status: "running" | "done" | "error";
  /** Browser steps taken so far. */
  steps: number;
  /** The latest step's description, e.g. "Searching for blue T-shirt". */
  title: string | null;
  /** The latest screenshot of the hosted browser (JPEG data URL). */
  image: string | null;
  result: ShopperResult | null;
  error: string | null;
}

export interface ShopperRun {
  url: string;
  task: string;
  screenshot: string | null;
}

export function useShopper(handlers?: {
  onNote?: (text: string) => void;
  onDone?: (result: ShopperResult) => void;
  onError?: (message: string) => void;
}) {
  const [view, setView] = useState<ShopperView | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latestHandlers = useRef(handlers);
  latestHandlers.current = handlers;

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setView(null);
  }, []);

  const start = useCallback(async (run: ShopperRun) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const update = (patch: (view: ShopperView) => ShopperView) =>
      setView((current) => (current && controller.current === abort ? patch(current) : current));
    setView({ status: "running", steps: 0, title: null, image: null, result: null, error: null });

    const fail = (message: string) => {
      update((view) => ({ ...view, status: "error", error: message }));
      latestHandlers.current?.onError?.(message);
    };

    try {
      const res = await fetch("/api/agent/shopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        fail(data.error ?? `/api/agent/shopper returned ${res.status}`);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line) as ShopperMessage;
          if (message.type === "step") {
            update((view) => ({
              ...view,
              steps: view.steps + 1,
              title: message.title,
              image: message.image ?? view.image,
            }));
          } else if (message.type === "note") {
            latestHandlers.current?.onNote?.(message.text);
          } else if (message.type === "done") {
            ended = true;
            update((view) => ({ ...view, status: "done", result: message.result }));
            latestHandlers.current?.onDone?.(message.result);
          } else if (message.type === "error") {
            ended = true;
            fail(message.message);
          }
        }
      }
      if (!ended && !abort.signal.aborted) fail("The shopper stopped without a result");
    } catch (cause) {
      if (abort.signal.aborted) return;
      fail(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  // Don't leave a browser shopping after the page goes away.
  useEffect(() => () => controller.current?.abort(), []);

  return { view, start, stop };
}
