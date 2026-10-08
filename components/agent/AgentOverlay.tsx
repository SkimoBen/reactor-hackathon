"use client";

// The Concierge's popover: the real shop's ordering page in an <iframe> over
// the world. Most ordering sites refuse to be framed, and the server already
// probed for that (lib/agent/concierge.ts checkEmbeddable), so a blocked site
// gets a card with the shop's details and a new-tab button instead of a
// silently blank frame. Same shell as SnapClip's ClipModal.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/happy-oyster/ui";

export interface OverlayTarget {
  title: string;
  address: string | null;
  url: string;
  embeddable: boolean;
  note: string | null;
}

export function AgentOverlay({
  target,
  onClose,
}: {
  target: OverlayTarget;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SectionLabel>Concierge</SectionLabel>
            <span className="truncate text-base font-medium text-white">
              {target.title}
            </span>
            {target.address && (
              <span className="truncate text-xs text-white/45">
                {target.address}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={target.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-7 items-center rounded-md border border-white/10 px-3 text-xs font-medium text-white/60 transition hover:border-white/25 hover:text-white/90"
            >
              Open in new tab ↗
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {target.note && (
          <p className="text-xs leading-relaxed text-white/45">{target.note}</p>
        )}

        {target.embeddable ? (
          <iframe
            src={target.url}
            title={target.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="h-[75dvh] w-full rounded-md border border-white/[0.06] bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-md border border-white/[0.06] bg-black/30 px-6 py-12 text-center">
            <p className="max-w-md text-sm leading-relaxed text-white/60">
              {target.title} doesn&apos;t allow its site to be embedded here, so
              it opens in its own tab.
            </p>
            <a
              href={target.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:brightness-95"
            >
              Open {target.title} ↗
            </a>
            <span className="max-w-full truncate font-mono text-[11px] text-white/30">
              {target.url}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
