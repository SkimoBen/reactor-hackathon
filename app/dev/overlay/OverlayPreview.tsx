"use client";

import { useEffect, useState } from "react";
import { AgentOverlay, type OverlayTarget } from "@/components/agent/AgentOverlay";
import { useShopper } from "@/components/agent/use-shopper";

// Mirrors the slot AgentPanel docks the overlay into: the stage's right column.
// With a task, the Shopper runs as it would in the app (minus the frame).
export function OverlayPreview({ target }: { target: OverlayTarget }) {
  const [open, setOpen] = useState(true);
  const shopper = useShopper();
  const { start, stop } = shopper;

  useEffect(() => {
    if (!open || !target.task) return;
    void start({ url: target.url, task: target.task, screenshot: null });
    return stop;
  }, [open, target.url, target.task, start, stop]);

  return (
    <div className="h-dvh bg-white p-3 sm:p-6 lg:p-10">
      <section className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] bg-[#a8a2a6] sm:rounded-[36px]">
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-primary px-6 py-3 text-primary-foreground"
        >
          Reopen overlay
        </button>
        {open && (
          <div className="absolute bottom-[5.5rem] right-3 top-3 flex w-[min(400px,calc(100%-1.5rem))] flex-col sm:bottom-[7.5rem] sm:right-6 sm:top-6">
            <AgentOverlay
              target={target}
              shopper={shopper.view}
              onClose={() => setOpen(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
