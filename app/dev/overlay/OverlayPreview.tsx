"use client";

import { useState } from "react";
import { AgentOverlay, type OverlayTarget } from "@/components/agent/AgentOverlay";

// Mirrors the slot AgentPanel docks the overlay into: the stage's right column.
export function OverlayPreview({ target }: { target: OverlayTarget }) {
  const [open, setOpen] = useState(true);
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
            <AgentOverlay target={target} onClose={() => setOpen(false)} />
          </div>
        )}
      </section>
    </div>
  );
}
