"use client";

// The frosted panel in the stage's top-right corner: what the user has said
// (the push-to-talk transcript, with the phrase still forming in grey) and what
// the agents did about it — the Director's observations and the moves it sent
// the world, the Concierge's answers. It collapses to its header.
//
// Where voice isn't available (Firefox), a text field stands in for the mic so
// the Concierge can still be reached.

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/events";
import { Spinner } from "@/components/happy-oyster/ui";
import type { Speech } from "./use-speech";

export function AgentPanel({
  events,
  speech,
  busy,
  error,
  onSay,
}: {
  events: AgentEvent[];
  speech: Speech;
  busy: boolean;
  error: string | null;
  onSay: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const feed = events.filter(shown);
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length, speech.interim, open]);

  const problem = speech.error ?? error;

  return (
    <div className="absolute right-3 top-3 z-20 w-[min(340px,calc(100%-1.5rem))] sm:right-6 sm:top-6">
      <div className="overflow-hidden rounded-[20px] bg-white/70 shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150">
        <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-3">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            title={open ? "Collapse" : "Expand"}
            className="-ml-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-foreground transition hover:bg-black/[0.05]"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 10.5 8 6l4.5 4.5" />
            </svg>
            <span className="text-[13px] font-semibold tracking-[-0.01em]">
              Transcript
            </span>
          </button>
          <div className="flex items-center gap-2">
            {busy && <Spinner />}
            {speech.supported && (
              <MicButton
                listening={speech.listening}
                onPress={speech.start}
                onRelease={speech.stop}
              />
            )}
          </div>
        </div>

        {open && (
          <>
            <div className="mx-4 h-px bg-black/[0.12]" />
            <div
              ref={scroller}
              className="flex max-h-[min(52vh,440px)] flex-col gap-3 overflow-y-auto px-4 py-3.5"
            >
              {feed.length === 0 && !speech.interim ? (
                <p className="text-[13px] leading-[1.45] text-muted-foreground">
                  {speech.supported
                    ? "Hold space to talk once you're exploring. What you say, and what the agent does about it, appears here."
                    : "Type below once you're exploring. What you say, and what the agent does about it, appears here."}
                </p>
              ) : (
                feed.map((event) => <Row key={event.id} event={event} />)
              )}
              {speech.interim && (
                <Line label="You" tone="text-foreground">
                  <span className="text-tertiary">{speech.interim}…</span>
                </Line>
              )}
            </div>
            {problem && (
              <p className="break-words px-4 pb-3 text-[12px] leading-snug text-destructive">
                {problem}
              </p>
            )}
            {!speech.supported && <TypeInstead busy={busy} onSay={onSay} />}
          </>
        )}
      </div>
    </div>
  );
}

// Hold-to-talk for the pointer, mirroring the space bar.
function MicButton({
  listening,
  onPress,
  onRelease,
}: {
  listening: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      title="Hold space, or hold here, to talk"
      className={`flex h-7 select-none items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition ${
        listening
          ? "bg-destructive/10 text-destructive"
          : "bg-black/[0.06] text-muted-foreground hover:text-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          listening ? "animate-pulse bg-destructive" : "bg-tertiary"
        }`}
      />
      {listening ? "Listening" : "Hold space"}
    </button>
  );
}

function TypeInstead({
  busy,
  onSay,
}: {
  busy: boolean;
  onSay: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSay(value);
    setText("");
  };
  return (
    <div className="px-3 pb-3">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") send();
        }}
        placeholder="Say something…"
        className="w-full rounded-full bg-black/[0.05] px-4 py-2 text-[13px] text-foreground outline-none transition placeholder:text-tertiary focus:bg-white focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

// Held controls and transport are bookkeeping for the agents, not conversation;
// a Director instruction already rides on its own "director" event.
function shown(event: AgentEvent): boolean {
  if (event.kind === "control" || event.kind === "transport") return false;
  if (event.kind === "instruction") return event.source === "concierge";
  return true;
}

function Row({ event }: { event: AgentEvent }) {
  switch (event.kind) {
    case "user_say":
      return (
        <Line label="You" tone="text-foreground">
          {event.text}
        </Line>
      );
    case "director":
      return (
        <Line label="Director" tone="text-primary">
          <span className="text-muted-foreground">{event.observation}</span>
          {event.instruction && <Move>{event.instruction}</Move>}
        </Line>
      );
    case "instruction":
      return (
        <Line label="Concierge" tone="text-[#c2410c]">
          <Move>{event.text}</Move>
        </Line>
      );
    case "concierge":
      return (
        <Line label="Concierge" tone="text-[#c2410c]">
          <span className="text-muted-foreground">{event.summary}</span>
        </Line>
      );
    case "overlay":
      return (
        <Line label="Concierge" tone="text-[#c2410c]">
          Opened {event.title}
        </Line>
      );
    case "error":
      return (
        <Line label={event.source} tone="text-destructive">
          <span className="text-destructive">{event.text}</span>
        </Line>
      );
    default:
      return null;
  }
}

function Line({
  label,
  tone,
  children,
}: {
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[11px] font-semibold capitalize ${tone}`}>
        {label}
      </span>
      <div className="flex flex-col gap-1 break-words text-[13px] leading-[1.45] text-foreground">
        {children}
      </div>
    </div>
  );
}

function Move({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex gap-1.5 font-medium text-foreground">
      <span aria-hidden className="text-tertiary">
        →
      </span>
      <span>{children}</span>
    </span>
  );
}
