"use client";

// Every agent call, kept for the debug panel: the frame and context the
// browser sent, the trace the server returned (exact prompt, tool calls, raw
// output), and the decision or error. Module-level for the same reason as the
// event log; capped low because each entry holds a JPEG.

import { useSyncExternalStore } from "react";
import type { AgentTrace } from "./protocol";

export interface DebugCall {
  id: number;
  at: number;
  agent: "director" | "concierge";
  durationMs: number;
  /** The frame sent with the call, as a data URL. */
  screenshot: string | null;
  /** The request body minus the frame. */
  request: Record<string, unknown>;
  trace: AgentTrace | null;
  /** The decision as the browser received it, minus the trace. */
  result: unknown;
  error: string | null;
}

const MAX_CALLS = 40;

let calls: DebugCall[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function logCall(call: Omit<DebugCall, "id">) {
  calls = [...calls, { ...call, id: nextId++ }].slice(-MAX_CALLS);
  emit();
}

export function clearCalls() {
  calls = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: DebugCall[] = [];

export function useDebugCalls(): DebugCall[] {
  return useSyncExternalStore(
    subscribe,
    () => calls,
    () => EMPTY,
  );
}
