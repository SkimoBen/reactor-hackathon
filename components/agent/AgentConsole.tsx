"use client";

// The agents' HUD: a floating card over the app with the "say something" input
// (the Concierge's trigger — a voice transcript would feed the same onSay),
// the Director on/off switch, and a feed of the last few events so you can
// watch the agents think. The input is a real <input>, so Adventure's WASD
// handler ignores keys typed into it.

import { useState } from "react";
import { type AgentEvent } from "@/lib/agent/events";
import { SectionLabel, Spinner } from "@/components/happy-oyster/ui";

export function AgentConsole({
  events,
  busy,
  error,
  streaming,
  directorEnabled,
  onToggleDirector,
  onSay,
}: {
  events: AgentEvent[];
  busy: boolean;
  error: string | null;
  streaming: boolean;
  directorEnabled: boolean;
  onToggleDirector: () => void;
  onSay: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);

  const send = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSay(value);
    setText("");
  };

  const feed = events.slice(-6);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 text-left"
          title={open ? "Collapse" : "Expand"}
        >
          <SectionLabel>Agents</SectionLabel>
          <span className="font-mono text-[10px] text-white/30">
            {open ? "▾" : "▸"}
          </span>
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-tight text-white/45">
          <input
            type="checkbox"
            checked={directorEnabled}
            onChange={onToggleDirector}
            className="accent-primary"
          />
          Director {streaming && directorEnabled ? "· watching" : ""}
        </label>
      </div>

      {open && (
        <>
          <div className="flex gap-1.5">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") send();
              }}
              placeholder="Say something… “I want to order a slice”"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/85 outline-none transition placeholder:text-white/25 focus:border-white/30 focus:ring-2 focus:ring-primary/20"
            />
            <button
              disabled={busy || text.trim().length === 0}
              onClick={send}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-95 disabled:opacity-40"
            >
              {busy ? <Spinner /> : "Say"}
            </button>
          </div>

          {error && (
            <p className="break-words text-xs leading-relaxed text-red-300/90">
              {error}
            </p>
          )}

          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
            {feed.length === 0 ? (
              <p className="text-xs text-white/30">
                The Director watches the stream; the Concierge listens here.
              </p>
            ) : (
              feed.map((event) => <EventRow key={event.id} event={event} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  const { tag, tone, text } = summarize(event);
  return (
    <div className="flex items-baseline gap-2 text-xs leading-relaxed">
      <span
        className={`shrink-0 font-mono text-[10px] uppercase tracking-tight ${tone}`}
      >
        {tag}
      </span>
      <span className="min-w-0 break-words text-white/70">{text}</span>
    </div>
  );
}

function summarize(event: AgentEvent): {
  tag: string;
  tone: string;
  text: string;
} {
  switch (event.kind) {
    case "user_say":
      return { tag: "you", tone: "text-white/50", text: event.text };
    case "instruction":
      return {
        tag: event.source,
        tone: toneFor(event.source),
        text: `→ ${event.text}`,
      };
    case "transport":
      return { tag: "you", tone: "text-white/50", text: event.action };
    case "control":
      return { tag: "you", tone: "text-white/50", text: event.detail };
    case "director":
      return {
        tag: "director",
        tone: toneFor("director"),
        text: event.observation,
      };
    case "concierge":
      return {
        tag: "concierge",
        tone: toneFor("concierge"),
        text: event.summary,
      };
    case "overlay":
      return {
        tag: "overlay",
        tone: "text-primary/90",
        text: event.title,
      };
    case "error":
      return { tag: event.source, tone: "text-red-400", text: event.text };
  }
}

function toneFor(source: "user" | "director" | "concierge"): string {
  return source === "director"
    ? "text-sky-300/80"
    : source === "concierge"
      ? "text-amber-300/80"
      : "text-white/50";
}
