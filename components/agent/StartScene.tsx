"use client";

// The one-click way in: build a Directing world that opens on the real
// Broadway photo (lib/agent/config.ts START_SCENE). In Directing mode the
// first-frame image is used verbatim, so the stream literally starts on the
// photo and the Director has something real to hold it to. The file is
// fetched from /public and handed to createWorld like a user upload.

import { useState } from "react";
import { START_SCENE } from "@/lib/agent/config";
import type { WorldIntent } from "@/lib/worlds";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/happy-oyster/ui";

export function StartScene({
  onIntent,
}: {
  onIntent: (intent: WorldIntent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(START_SCENE.imagePath);
      if (!res.ok) throw new Error(`Could not load ${START_SCENE.imagePath}`);
      const blob = await res.blob();
      const firstFrameImage = new File([blob], "start-frame.jpeg", {
        type: "image/jpeg",
      });
      onIntent({
        kind: "create",
        mode: "directing",
        title: START_SCENE.title,
        params: {
          prompt: START_SCENE.prompt,
          firstFrameImage,
          resolution: "720p",
          layout: "Stable",
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
      <SectionLabel>Start in New York</SectionLabel>
      <img
        src={START_SCENE.imagePath}
        alt={START_SCENE.place}
        className="w-full rounded-md border border-white/[0.06]"
      />
      <p className="text-[11px] leading-relaxed text-white/45">
        {START_SCENE.place}. A Directing world that opens on this photo; the
        Director keeps it looking like the real street, the Concierge turns
        what you say into real shops.
      </p>
      <Button onClick={() => void start()} disabled={busy}>
        {busy ? "Loading…" : "Start walking"}
      </Button>
      {error && <p className="text-xs text-red-300/90">{error}</p>}
    </div>
  );
}
