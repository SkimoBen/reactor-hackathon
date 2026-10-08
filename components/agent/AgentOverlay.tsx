"use client";

// The Concierge's popover: the real shop's ordering page in an <iframe> over
// the world. Most ordering sites refuse to be framed, and the server already
// probed for that (lib/agent/concierge.ts checkEmbeddable), so a blocked site
// gets a card with the shop's details and a new-tab button instead of a
// silently blank frame.

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col gap-4 rounded-[24px] bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SectionLabel>Concierge</SectionLabel>
            <span className="truncate text-[21px] font-semibold tracking-[-0.021em] text-foreground">
              {target.title}
            </span>
            {target.address && (
              <span className="truncate text-[13px] text-muted-foreground">
                {target.address}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={target.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-primary transition hover:bg-primary/[0.08]"
            >
              Open in new tab ↗
            </a>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {target.note && (
          <p className="text-[15px] leading-[1.45] text-muted-foreground">
            {target.note}
          </p>
        )}

        {target.embeddable ? (
          <iframe
            src={target.url}
            title={target.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="h-[75dvh] w-full rounded-2xl bg-white ring-1 ring-black/[0.06]"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-muted px-6 py-12 text-center">
            <p className="max-w-md text-[15px] leading-[1.45] text-muted-foreground">
              {target.title} doesn&apos;t allow its site to be embedded here, so
              it opens in its own tab.
            </p>
            <a
              href={target.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition hover:bg-[#0077ed]"
            >
              Open {target.title} ↗
            </a>
            <span className="max-w-full truncate font-mono text-[12px] text-tertiary">
              {target.url}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
