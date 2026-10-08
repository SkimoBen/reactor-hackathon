"use client";

// The action log the agents read from.
//
// HappyOyster reports nothing about what the user does — the only record of
// instructions, transport, and (in Adventure) held controls is our own calls
// to the client, which ho-client.tsx logs here. The agents' own observations
// and decisions land in the same log, so each call sees the full recent
// history: what the user said, what the world was told, what the agents
// concluded.
//
// It's a module-level store rather than React state on purpose: the live
// provider is keyed on the experience mode, so anything inside it is wiped
// when a Directing world replaces an Adventure one. This survives that.

import { useSyncExternalStore } from "react";

export type AgentSource = "user" | "director" | "concierge";

export type AgentEvent = { id: number; at: number } & (
  | { kind: "user_say"; text: string }
  | { kind: "instruction"; text: string; source: AgentSource }
  | { kind: "transport"; action: "pause" | "resume" | "rewind"; detail?: string }
  | { kind: "control"; detail: string }
  | { kind: "director"; observation: string; instruction: string | null }
  | { kind: "concierge"; summary: string }
  | { kind: "overlay"; title: string; url: string }
  | { kind: "error"; source: AgentSource; text: string }
);

export type AgentEventInput = AgentEvent extends infer E
  ? E extends { id: number; at: number }
    ? Omit<E, "id" | "at">
    : never
  : never;

const MAX_EVENTS = 200;

let events: AgentEvent[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function logEvent(input: AgentEventInput): AgentEvent {
  const event = { ...input, id: nextId++, at: Date.now() } as AgentEvent;
  events = [...events, event].slice(-MAX_EVENTS);
  emit();
  return event;
}

export function clearEvents() {
  events = [];
  emit();
}

export function recentEvents(count: number): AgentEvent[] {
  return events.slice(-count);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: AgentEvent[] = [];

/** Live view of the log; re-renders on every new event. */
export function useAgentEvents(): AgentEvent[] {
  return useSyncExternalStore(
    subscribe,
    () => events,
    () => EMPTY,
  );
}

/** One line per event, the form the agents read it in. */
export function describeEvent(event: AgentEvent): string {
  const t = new Date(event.at).toISOString().slice(11, 19);
  switch (event.kind) {
    case "user_say":
      return `[${t}] user said: "${event.text}"`;
    case "instruction":
      return `[${t}] ${event.source} instructed the world: "${event.text}"`;
    case "transport":
      return `[${t}] user ${event.action}${event.detail ? ` (${event.detail})` : ""}`;
    case "control":
      return `[${t}] user control: ${event.detail}`;
    case "director":
      return `[${t}] director saw: ${event.observation}${
        event.instruction ? ` → instructed "${event.instruction}"` : ""
      }`;
    case "concierge":
      return `[${t}] concierge: ${event.summary}`;
    case "overlay":
      return `[${t}] overlay opened: ${event.title} (${event.url})`;
    case "error":
      return `[${t}] ${event.source} error: ${event.text}`;
  }
}
