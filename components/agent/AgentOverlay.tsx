"use client";

// The Concierge's popover: the real shop's ordering page in a small <iframe>
// window docked under the transcript panel, so the world stays in view beside
// it. Most ordering sites refuse to be framed, and the server already probed
// for that (lib/agent/concierge.ts checkEmbeddable), so a blocked site gets a
// card with the shop's details and a new-tab button instead of a silently
// blank frame. It fills whatever height its parent column leaves it.

import { useEffect } from "react";

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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-[20px] bg-white/70 p-3.5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 pl-0.5 pt-0.5">
          <span className="truncate text-[17px] font-semibold tracking-[-0.015em] text-foreground">
            {target.title}
          </span>
          {target.address && (
            <span className="truncate text-[12px] text-muted-foreground">
              {target.address}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <a
            href={target.url}
            target="_blank"
            rel="noreferrer noopener"
            title="Open in new tab"
            aria-label="Open in new tab"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
            </svg>
          </a>
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/[0.05] hover:text-foreground"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div
        title={target.url}
        className="truncate rounded-[10px] bg-white/80 px-3 py-1.5 font-mono text-[12px] text-muted-foreground ring-1 ring-black/[0.08]"
      >
        {target.url}
      </div>

      {target.note && (
        <p className="px-0.5 text-[12px] leading-snug text-muted-foreground">
          {target.note}
        </p>
      )}

      {target.embeddable ? (
        <iframe
          src={target.url}
          title={target.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 rounded-[14px] bg-white ring-1 ring-black/[0.06]"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[14px] bg-black/[0.04] px-5 py-8 text-center">
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            {target.title} doesn&apos;t allow its site to be embedded here, so
            it opens in its own tab.
          </p>
          <a
            href={target.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center rounded-full bg-black px-5 text-[13px] font-medium text-white transition hover:bg-[#222]"
          >
            Open {target.title} ↗
          </a>
        </div>
      )}
    </div>
  );
}
