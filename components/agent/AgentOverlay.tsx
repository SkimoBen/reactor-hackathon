"use client";

// The Concierge's popover: the real shop's ordering page in a small <iframe>
// window docked under the transcript panel, so the world stays in view beside
// it. Most ordering sites refuse to be framed, and the server already probed
// for that (lib/agent/concierge.ts checkEmbeddable), so a blocked site gets a
// card with the shop's details and a new-tab button instead of a silently
// blank frame. It fills whatever height its parent column leaves it.
//
// When the overlay is for buying a particular item, the Shopper's hosted
// browser takes the frame's place: its latest screenshot and step while it
// shops, then what it found and a link that opens the cart in the user's own
// browser.

import { useEffect } from "react";
import { Spinner } from "@/components/happy-oyster/ui";
import type { ShopperView } from "./use-shopper";

export interface OverlayTarget {
  title: string;
  address: string | null;
  url: string;
  embeddable: boolean;
  note: string | null;
  /** What the Shopper should find here; null for a plain ordering page. */
  task: string | null;
}

export function AgentOverlay({
  target,
  shopper = null,
  onClose,
}: {
  target: OverlayTarget;
  shopper?: ShopperView | null;
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

      {target.note && !shopper && (
        <p className="px-0.5 text-[12px] leading-snug text-muted-foreground">
          {target.note}
        </p>
      )}

      {shopper ? (
        <ShopperScreen target={target} shopper={shopper} />
      ) : target.embeddable ? (
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

function ShopperScreen({
  target,
  shopper,
}: {
  target: OverlayTarget;
  shopper: ShopperView;
}) {
  const { status, image, title, steps, result, error } = shopper;
  const link = result?.cart_url ?? result?.product_url ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] bg-black/[0.04] ring-1 ring-black/[0.06]">
        {image ? (
          // A data URL streamed from the hosted browser; next/image adds nothing.
          <img
            src={image}
            alt={title ?? "The shopper's browser"}
            className="h-full w-full object-contain object-top"
          />
        ) : (
          status === "running" && (
            <div className="flex flex-col items-center gap-2 text-[12px] text-muted-foreground">
              <Spinner />
              {steps === 0 ? "Starting a browser…" : "Waiting for the first screenshot…"}
            </div>
          )
        )}
      </div>

      {status === "running" && (
        <div className="flex items-center gap-2 px-0.5">
          <Spinner />
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            {title ?? `Looking for ${target.task ?? "it"}`}
          </span>
          {steps > 0 && (
            <span className="shrink-0 text-[11px] tabular-nums text-tertiary">
              step {steps}
            </span>
          )}
        </div>
      )}

      {status === "done" && result && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-white/80 px-3 py-2.5 ring-1 ring-black/[0.06]">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {result.product_name ?? "No match found"}
            </span>
            {result.price && (
              <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                {result.price}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-snug text-muted-foreground">{result.summary}</p>
          <a
            href={link ?? target.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center justify-center rounded-full bg-black px-5 text-[13px] font-medium text-white transition hover:bg-[#222]"
          >
            {result.cart_url ? "Open cart ↗" : result.product_url ? "View product ↗" : `Open ${target.title} ↗`}
          </a>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-destructive/[0.06] px-3 py-2.5">
          <p className="break-words text-[12px] leading-snug text-destructive">{error}</p>
          <a
            href={target.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center justify-center rounded-full bg-black px-5 text-[13px] font-medium text-white transition hover:bg-[#222]"
          >
            Open {target.title} ↗
          </a>
        </div>
      )}
    </div>
  );
}
