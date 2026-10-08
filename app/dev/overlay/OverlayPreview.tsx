"use client";

import { useState } from "react";
import { AgentOverlay, type OverlayTarget } from "@/components/agent/AgentOverlay";

export function OverlayPreview({ target }: { target: OverlayTarget }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted">
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-primary px-6 py-3 text-primary-foreground"
      >
        Reopen overlay
      </button>
      {open && <AgentOverlay target={target} onClose={() => setOpen(false)} />}
    </div>
  );
}
