"use client";

import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground">
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black/55" />
  );
}
