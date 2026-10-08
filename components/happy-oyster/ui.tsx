"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared surfaces, in the Apple web idiom: white cards floating on the gray
// canvas, sentence-case titles, and segmented controls for every choice.

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[18px] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_20px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[15px] font-semibold tracking-[-0.016em] text-foreground">
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground">
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-[1.45] text-muted-foreground">
      {children}
    </p>
  );
}

/** Text fields share one look: white, hairline border, blue focus halo. */
export const FIELD =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-[15px] text-foreground outline-none transition placeholder:text-tertiary focus:border-primary focus:ring-4 focus:ring-primary/15";

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black/55" />
  );
}

// A segmented control — the gray track with a white sliding thumb.
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-[10px] bg-fill p-[3px]", className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-center text-[13px] font-medium transition ${
            value === option.value
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// The world id is a capability: it exists from the moment the backend
// registers the build (visible in world_state snapshots while still
// building), and attachWorld() with it skips the build wait forever after.
export function WorldIdChip({ worldId }: { worldId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(worldId).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy this world's attach id"
      className="max-w-full truncate rounded-[10px] bg-muted px-3 py-2 text-left font-mono text-[12px] text-muted-foreground transition hover:bg-fill hover:text-foreground"
    >
      {copied ? "Copied attach id" : worldId}
    </button>
  );
}

export function ModeBadge({ mode }: { mode: number | null }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">
      {mode === 2 ? "Directing" : "Adventure"}
    </span>
  );
}
